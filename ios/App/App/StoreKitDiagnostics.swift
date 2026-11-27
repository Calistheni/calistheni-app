#if CALISTHENI_STOREKIT_DIAGNOSTICS
import Foundation

enum StoreKitDiagnosticTokenMatch: String {
    case match = "Matches current Calistheni account"
    case mismatch = "Different Calistheni account token"
    case missing = "Apple-signed account token missing"
    case unknown = "Unknown — current Calistheni token unavailable"
    case unverified = "Unknown — StoreKit could not verify the transaction"

    init(verified: Bool, transactionToken: UUID?, accountToken: UUID?) {
        guard verified else { self = .unverified; return }
        guard let transactionToken else { self = .missing; return }
        guard let accountToken else { self = .unknown; return }
        self = transactionToken == accountToken ? .match : .mismatch
    }
}

#if os(iOS)
import StoreKit
import UIKit
import WebKit

extension MainViewController {
    func installStoreKitDiagnostics() {
        let button = UIButton(type: .system)
        button.configuration = .filled()
        button.setTitle("StoreKit Diagnostics", for: .normal)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.addTarget(self, action: #selector(showStoreKitDiagnostics), for: .touchUpInside)
        view.addSubview(button)
        NSLayoutConstraint.activate([
            button.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
            button.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -8)
        ])
    }

    @objc private func showStoreKitDiagnostics() {
        guard presentedViewController == nil else { return }
        let report = StoreKitDiagnosticsViewController()
        present(UINavigationController(rootViewController: report), animated: true)
        Task {
            report.show(await StoreKitDiagnosticSnapshot.read(webView: webView))
        }
    }
}

private final class StoreKitDiagnosticsViewController: UIViewController {
    private let report = UITextView()

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "StoreKit Diagnostics"
        view.backgroundColor = .systemBackground
        navigationItem.rightBarButtonItem = UIBarButtonItem(systemItem: .done, primaryAction: UIAction { [weak self] _ in
            self?.dismiss(animated: true)
        })
        report.isEditable = false
        report.font = .preferredFont(forTextStyle: .body)
        report.adjustsFontForContentSizeCategory = true
        report.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(report)
        NSLayoutConstraint.activate([
            report.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            report.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            report.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
            report.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor)
        ])
        report.text = "Reading StoreKit…"
    }

    func show(_ snapshot: String) {
        loadViewIfNeeded()
        report.text = snapshot
    }
}

@MainActor
private enum StoreKitDiagnosticSnapshot {
    private static let plans = [
        (id: CalistheniStoreKitPlugin.monthlyProductId, name: "Monthly"),
        (id: CalistheniStoreKitPlugin.yearlyProductId, name: "Yearly")
    ]

    static func read(webView: WKWebView?) async -> String {
        let storefront = await Storefront.current?.countryCode
        let products = try? await Product.products(for: plans.map(\.id))
        let storefrontAfterFetch = await Storefront.current?.countryCode
        let account = await readExistingAccount(webView: webView)
        var lines = [
            "Checked \(Date.now.ISO8601Format())",
            "Storefront: \(storefrontAfterFetch ?? "Unknown")"
        ]
        if storefront != storefrontAfterFetch {
            lines.append("Storefront changed during the price request. Close and re-open to refresh.")
        }
        lines += plans.map { plan in
            let price = products?.first { $0.id == plan.id }?.displayPrice
            return "\(plan.name): \(price ?? (products == nil ? "Price request failed" : "Product unavailable"))"
        }
        lines += ["", account.status, "", "Transactions on this device"]

        var rows: [String] = []
        for await result in Transaction.currentEntitlements {
            if let row = transactionRow(result, source: "Current entitlement", accountToken: account.token) {
                rows.append(row)
            }
        }
        for await result in Transaction.unfinished {
            if let row = transactionRow(result, source: "Unfinished", accountToken: account.token) {
                rows.append(row)
            }
        }
        lines += rows.isEmpty ? ["No Monthly or Yearly transactions in either source."] : rows
        if !rows.isEmpty {
            lines.append("A transaction may appear in both sources.")
        }
        return lines.joined(separator: "\n")
    }

    private static func transactionRow(
        _ result: VerificationResult<Transaction>, source: String, accountToken: UUID?
    ) -> String? {
        switch result {
        case .verified(let transaction):
            guard let plan = plans.first(where: { $0.id == transaction.productID }) else { return nil }
            let match = StoreKitDiagnosticTokenMatch(
                verified: true, transactionToken: transaction.appAccountToken, accountToken: accountToken
            )
            return "\(source) · \(plan.name) · \(match.rawValue)"
        case .unverified(let transaction, _):
            guard plans.contains(where: { $0.id == transaction.productID }) else { return nil }
            return "\(source) · \(StoreKitDiagnosticTokenMatch.unverified.rawValue)"
        }
    }

    private static func readExistingAccount(webView: WKWebView?) async -> (token: UUID?, status: String) {
        let unavailable = (token: UUID?.none, status: "Calistheni account lookup unavailable.")
        guard let webView,
              let url = webView.url,
              url.scheme == "https", url.host == "calistheni.app", url.port == nil else {
            return unavailable
        }

        // Isolate the lookup from page scripts. The token is used in memory
        // for equality checks and is never included in the report.
        let result = try? await webView.callAsyncJavaScript("""
            if (location.origin !== 'https://calistheni.app') return null;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 8000);
            try {
                const response = await fetch('/api/billing/apple/existing-account', {
                    credentials: 'same-origin', cache: 'no-store', redirect: 'error',
                    signal: controller.signal
                });
                if (response.status === 401) return { state: 'signed-out' };
                if (!response.ok) return null;
                const data = await response.json();
                if (data.appAccountToken === null) return { state: 'missing' };
                return { token: data.appAccountToken };
            } finally {
                clearTimeout(timer);
            }
            """, arguments: [:], in: nil, contentWorld: .defaultClient)
        guard let result = result as? [String: Any] else { return unavailable }
        switch result["state"] as? String {
        case "signed-out": return (nil, "Sign in to Calistheni to compare account tokens.")
        case "missing": return (nil, "Current Calistheni account has no existing Apple billing token.")
        default:
            guard let value = result["token"] as? String, let token = UUID(uuidString: value) else {
                return unavailable
            }
            return (token, "Current Calistheni account available for comparison.")
        }
    }
}
#endif
#endif
