import Capacitor
import Foundation
import Security

@objc(CalistheniSecureSessionPlugin)
public class CalistheniSecureSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CalistheniSecureSessionPlugin"
    public let jsName = "CalistheniSecureSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getSessionToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSessionToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSessionToken", returnType: CAPPluginReturnPromise)
    ]
    private let service = "com.petershikrenov.calistheni.native-session"
    private let account = "current"
    private var baseQuery: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account,
         kSecAttrSynchronizable as String: kCFBooleanFalse as Any]
    }

    @objc func getSessionToken(_ call: CAPPluginCall) {
        var query = baseQuery
        query[kSecReturnData as String] = kCFBooleanTrue
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { call.resolve(["token": NSNull()]); return }
        guard status == errSecSuccess, let data = item as? Data,
              let token = String(data: data, encoding: .utf8) else {
            call.reject("Unable to read the secure session.", "KEYCHAIN_READ_FAILED"); return
        }
        call.resolve(["token": token])
    }

    @objc func setSessionToken(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), !token.isEmpty,
              let data = token.data(using: .utf8) else {
            call.reject("A session token is required.", "KEYCHAIN_TOKEN_INVALID"); return
        }
        SecItemDelete(baseQuery as CFDictionary)
        var query = baseQuery
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else {
            call.reject("Unable to save the secure session.", "KEYCHAIN_WRITE_FAILED"); return
        }
        call.resolve()
    }

    @objc func clearSessionToken(_ call: CAPPluginCall) {
        let status = SecItemDelete(baseQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            call.reject("Unable to clear the secure session.", "KEYCHAIN_DELETE_FAILED"); return
        }
        call.resolve()
    }
}
