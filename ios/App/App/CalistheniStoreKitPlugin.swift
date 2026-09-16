import Capacitor
import StoreKit
import UIKit

@objc(CalistheniStoreKitPlugin)
public class CalistheniStoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CalistheniStoreKitPlugin"
    public let jsName = "CalistheniStoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "currentEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishTransaction", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showManageSubscriptions", returnType: CAPPluginReturnPromise)
    ]

    private static let monthlyProductId = "com.petershikrenov.calistheni.pro.monthly"
    private static let yearlyProductId = "com.petershikrenov.calistheni.pro.yearly"
    private static let lifetimeProductId = "com.petershikrenov.calistheni.pro.lifetime"
    private static let productIds = [monthlyProductId, yearlyProductId, lifetimeProductId]
    private static let productIdSet = Set(productIds)

    private var productsById: [String: Product] = [:]
    private var transactionUpdatesTask: Task<Void, Never>?

    public override func load() {
        startTransactionUpdatesListener()
    }

    deinit {
        transactionUpdatesTask?.cancel()
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        Self.log("availability checked bundle=\(Bundle.main.bundleIdentifier ?? "unknown") available=true")
        call.resolve(["available": true])
    }

    @objc func loadProducts(_ call: CAPPluginCall) {
        let requestedProductIds = Self.productIds
        Self.log(
            "product load started bundle=\(Bundle.main.bundleIdentifier ?? "unknown") " +
            "requestedIds=\(requestedProductIds.joined(separator: ","))"
        )
        Task { [weak self] in
            guard let self else {
                Self.log("product load failed code=STOREKIT_UNAVAILABLE")
                call.reject("StoreKit is unavailable.", "STOREKIT_UNAVAILABLE")
                return
            }
            do {
                let products = try await Product.products(for: requestedProductIds)
                    .filter { Self.productIdSet.contains($0.id) }
                self.productsById = Dictionary(uniqueKeysWithValues: products.map { ($0.id, $0) })
                let ordered = requestedProductIds.compactMap { productId in
                    products.first(where: { $0.id == productId }).map(self.productPayload)
                }
                let returnedProductIds = ordered.compactMap { $0["productId"] as? String }
                let returnedProductIdSet = Set(returnedProductIds)
                let missingProductIds = requestedProductIds.filter {
                    !returnedProductIdSet.contains($0)
                }
                Self.log(
                    "product load completed rawCount=\(products.count) " +
                    "returnedIds=\(returnedProductIds.joined(separator: ",")) " +
                    "missingIds=\(missingProductIds.joined(separator: ","))"
                )
                call.resolve([
                    "products": ordered,
                    "diagnostics": [
                        "requestedProductIds": requestedProductIds,
                        "returnedProductIds": returnedProductIds,
                        "missingProductIds": missingProductIds,
                        "storeKitProductCount": products.count
                    ]
                ])
            } catch {
                let storeKitError = error as NSError
                Self.log(
                    "product load failed code=STOREKIT_PRODUCT_LOAD_FAILED " +
                    "errorDomain=\(storeKitError.domain) errorCode=\(storeKitError.code)"
                )
                call.reject("Unable to load App Store products.", "STOREKIT_PRODUCT_LOAD_FAILED")
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"),
              Self.productIdSet.contains(productId) else {
            call.reject("This App Store product is not allowed.", "STOREKIT_PRODUCT_NOT_ALLOWED")
            return
        }
        guard let tokenValue = call.getString("appAccountToken"),
              let appAccountToken = UUID(uuidString: tokenValue) else {
            call.reject("A valid app account token is required.", "STOREKIT_ACCOUNT_TOKEN_INVALID")
            return
        }

        Task { [weak self] in
            guard let self else {
                call.reject("StoreKit is unavailable.", "STOREKIT_UNAVAILABLE")
                return
            }
            do {
                let product: Product
                if let cached = self.productsById[productId] {
                    product = cached
                } else if let loaded = try await Product.products(for: [productId]).first,
                          Self.productIdSet.contains(loaded.id) {
                    self.productsById[loaded.id] = loaded
                    product = loaded
                } else {
                    call.reject("This App Store product is unavailable.", "STOREKIT_PRODUCT_UNAVAILABLE")
                    return
                }

                let result = try await product.purchase(options: [.appAccountToken(appAccountToken)])
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        call.resolve([
                            "outcome": "success",
                            "transaction": self.transactionPayload(
                                transaction,
                                signedTransaction: verification.jwsRepresentation
                            )
                        ])
                    case .unverified:
                        call.resolve(["outcome": "unverified"])
                    }
                case .pending:
                    call.resolve(["outcome": "pending"])
                case .userCancelled:
                    call.resolve(["outcome": "userCancelled"])
                @unknown default:
                    call.reject("StoreKit returned an unsupported purchase result.", "STOREKIT_UNKNOWN_RESULT")
                }
            } catch {
                call.reject("The App Store purchase could not be completed.", "STOREKIT_PURCHASE_FAILED")
            }
        }
    }

    @objc func currentEntitlements(_ call: CAPPluginCall) {
        Task { [weak self] in
            guard let self else {
                call.reject("StoreKit is unavailable.", "STOREKIT_UNAVAILABLE")
                return
            }
            call.resolve(await self.collectCurrentAndUnfinishedTransactions())
        }
    }

    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task { [weak self] in
            guard let self else {
                call.reject("StoreKit is unavailable.", "STOREKIT_UNAVAILABLE")
                return
            }
            do {
                try await AppStore.sync()
                call.resolve(await self.collectCurrentAndUnfinishedTransactions())
            } catch {
                call.reject("Purchases could not be restored from the App Store.", "STOREKIT_RESTORE_FAILED")
            }
        }
    }

    @objc func finishTransaction(_ call: CAPPluginCall) {
        guard let transactionId = call.getString("transactionId") else {
            call.reject("A transaction ID is required.", "STOREKIT_TRANSACTION_ID_REQUIRED")
            return
        }
        Task {
            for await result in Transaction.unfinished {
                guard case .verified(let transaction) = result,
                      Self.productIdSet.contains(transaction.productID),
                      String(transaction.id) == transactionId else { continue }
                await transaction.finish()
                call.resolve(["finished": true])
                return
            }
            // It was already finished, or is not locally verified. Both cases
            // are safe after the backend has acknowledged the signed JWS.
            call.resolve(["finished": false])
        }
    }

    @objc func showManageSubscriptions(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *),
              let scene = bridge?.viewController?.view.window?.windowScene else {
            call.reject("Subscription management is unavailable.", "STOREKIT_MANAGEMENT_UNAVAILABLE")
            return
        }
        Task {
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve(["presented": true])
            } catch {
                call.reject("Subscription management could not be opened.", "STOREKIT_MANAGEMENT_FAILED")
            }
        }
    }

    private func startTransactionUpdatesListener() {
        guard transactionUpdatesTask == nil else { return }
        transactionUpdatesTask = Task { [weak self] in
            for await result in Transaction.updates {
                guard let self, !Task.isCancelled else { return }
                switch result {
                case .verified(let transaction):
                    guard Self.productIdSet.contains(transaction.productID) else { continue }
                    self.notifyListeners("transactionUpdated", data: [
                        "status": "verified",
                        "transaction": self.transactionPayload(
                            transaction,
                            signedTransaction: result.jwsRepresentation
                        )
                    ])
                case .unverified(let transaction, _):
                    self.notifyListeners("transactionUpdated", data: [
                        "status": "unverified",
                        "transactionId": String(transaction.id)
                    ])
                }
            }
        }
    }

    private func collectCurrentAndUnfinishedTransactions() async -> [String: Any] {
        var transactionsById: [String: [String: Any]] = [:]
        var unverifiedCount = 0

        for await result in Transaction.currentEntitlements {
            switch result {
            case .verified(let transaction):
                guard Self.productIdSet.contains(transaction.productID) else { continue }
                transactionsById[String(transaction.id)] = transactionPayload(
                    transaction,
                    signedTransaction: result.jwsRepresentation
                )
            case .unverified:
                unverifiedCount += 1
            }
        }

        for await result in Transaction.unfinished {
            switch result {
            case .verified(let transaction):
                guard Self.productIdSet.contains(transaction.productID) else { continue }
                transactionsById[String(transaction.id)] = transactionPayload(
                    transaction,
                    signedTransaction: result.jwsRepresentation
                )
            case .unverified:
                unverifiedCount += 1
            }
        }

        let ordered = transactionsById.values.sorted {
            ($0["transactionId"] as? String ?? "") < ($1["transactionId"] as? String ?? "")
        }
        return [
            "transactions": ordered,
            "unverifiedCount": unverifiedCount
        ]
    }

    private func productPayload(_ product: Product) -> [String: Any] {
        let kind: String
        switch product.type {
        case .autoRenewable:
            kind = "subscription"
        case .nonConsumable:
            kind = "lifetime"
        default:
            kind = "unsupported"
        }

        return [
            "productId": product.id,
            "displayName": product.displayName,
            "description": product.description,
            "displayPrice": product.displayPrice,
            "type": kind,
            "subscriptionPeriod": subscriptionPeriodPayload(product.subscription?.subscriptionPeriod) ?? NSNull()
        ]
    }

    private func subscriptionPeriodPayload(_ period: Product.SubscriptionPeriod?) -> [String: Any]? {
        guard let period else { return nil }
        let unit: String
        switch period.unit {
        case .day: unit = "day"
        case .week: unit = "week"
        case .month: unit = "month"
        case .year: unit = "year"
        @unknown default: return nil
        }
        return ["value": period.value, "unit": unit]
    }

    private func transactionPayload(
        _ transaction: Transaction,
        signedTransaction: String
    ) -> [String: Any] {
        let environment: String
        if #available(iOS 16.0, *) {
            environment = transaction.environment.rawValue
        } else {
            // The signed JWS still carries the authoritative environment. This
            // display-only field is unavailable on iOS 15.
            environment = "Unknown"
        }
        return [
            "transactionId": String(transaction.id),
            "originalTransactionId": String(transaction.originalID),
            "productId": transaction.productID,
            "environment": environment,
            "signedTransaction": signedTransaction
        ]
    }

    private static func log(_ message: String) {
        print("[AppleIAP] \(message)")
    }
}
