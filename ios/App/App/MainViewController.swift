import Capacitor
import UIKit

class MainViewController: CAPBridgeViewController {
#if DEBUG
    private var runtimeButton: UIButton?
    private var runtimePanel: UILabel?
#endif

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        // Capacitor 8 auto-registers CAPBridgedPlugin types listed in the
        // bundled capacitor.config.json. The build phase adds
        // NutritionBarcodeScannerPlugin there before resources are copied.
#if DEBUG
        installRuntimeDiagnostics()
#endif
    }

#if DEBUG
    private func installRuntimeDiagnostics() {
        let button = UIButton(type: .system)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.setTitle("NATIVE DEV", for: .normal)
        button.titleLabel?.font = .monospacedSystemFont(ofSize: 10, weight: .bold)
        button.backgroundColor = UIColor(red: 0.27, green: 0.10, blue: 0.01, alpha: 0.96)
        button.tintColor = UIColor(red: 1.0, green: 0.93, blue: 0.72, alpha: 1)
        button.layer.borderColor = UIColor.systemOrange.cgColor
        button.layer.borderWidth = 1
        button.layer.cornerRadius = 7
        button.addTarget(self, action: #selector(toggleRuntimeDiagnostics), for: .touchUpInside)

        let panel = UILabel()
        panel.translatesAutoresizingMaskIntoConstraints = false
        panel.numberOfLines = 0
        panel.font = .monospacedSystemFont(ofSize: 9, weight: .regular)
        panel.textColor = UIColor(red: 1.0, green: 0.93, blue: 0.72, alpha: 1)
        panel.backgroundColor = UIColor(white: 0.02, alpha: 0.97)
        panel.layer.borderColor = UIColor.systemOrange.cgColor
        panel.layer.borderWidth = 1
        panel.layer.cornerRadius = 8
        panel.layer.masksToBounds = true
        panel.isHidden = false

        view.addSubview(button)
        view.addSubview(panel)
        NSLayoutConstraint.activate([
            button.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 8),
            button.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
            button.heightAnchor.constraint(equalToConstant: 28),
            panel.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 8),
            panel.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -8),
            panel.topAnchor.constraint(equalTo: button.bottomAnchor, constant: 6)
        ])
        runtimeButton = button
        runtimePanel = panel
        // Static chunks can hydrate after the native bridge is ready. Refresh
        // twice so the initially visible panel gains the JS/auth payload too.
        for delay in [2.0, 6.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                self?.refreshRuntimeDiagnostics()
            }
        }
    }

    @objc private func toggleRuntimeDiagnostics() {
        guard let panel = runtimePanel else { return }
        panel.isHidden.toggle()
        if !panel.isHidden { refreshRuntimeDiagnostics() }
    }

    private func refreshRuntimeDiagnostics() {
        guard let panel = runtimePanel else { return }
        let configURL = Bundle.main.url(forResource: "capacitor.config", withExtension: "json")
        let manifestURL = Bundle.main.resourceURL?.appendingPathComponent("public/native-runtime.json")
        let config = configURL.flatMap { try? Data(contentsOf: $0) }.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        let manifest = manifestURL.flatMap { try? Data(contentsOf: $0) }.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        let server = (config?["server"] as? [String: Any])?["url"] as? String
        let webDir = config?["webDir"] as? String ?? "missing"
        let buildID = manifest?["buildId"] as? String ?? "missing"
        let runtime = manifest?["runtime"] as? String ?? (server == nil ? "unknown" : "remote")
        let nativeSummary = "runtime=\(runtime)\nbuild=\(buildID)\nwebDir=\(webDir)\nserver.url=\(server ?? "absent")\nwebview=\(webView?.url?.absoluteString ?? "not-loaded")"
        webView?.evaluateJavaScript("JSON.stringify(window.__CALISTHENI_NATIVE_DIAGNOSTICS__ ? window.__CALISTHENI_NATIVE_DIAGNOSTICS__() : null)") { value, error in
            let javascript = value as? String ?? (error == nil ? "JS diagnostics unavailable" : "JS error: \(error!.localizedDescription)")
            DispatchQueue.main.async { panel.text = "  \(nativeSummary.replacingOccurrences(of: "\n", with: "\n  "))\n\n  JS=\(javascript)  " }
        }
    }
#endif
}
