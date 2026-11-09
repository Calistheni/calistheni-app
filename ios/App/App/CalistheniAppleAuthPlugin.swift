import AuthenticationServices
import Capacitor

@objc(CalistheniAppleAuthPlugin)
public class CalistheniAppleAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "CalistheniAppleAuthPlugin"
    public let jsName = "CalistheniAppleAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCredentialState", returnType: CAPPluginReturnPromise)
    ]
    private var pendingCall: CAPPluginCall?
    private let appleUserKey = "calistheni.apple.user-identifier"

    @objc func getCredentialState(_ call: CAPPluginCall) {
        guard let userIdentifier = UserDefaults.standard.string(forKey: appleUserKey),
              !userIdentifier.isEmpty else {
            call.resolve(["state": "notStored"])
            return
        }
        ASAuthorizationAppleIDProvider().getCredentialState(forUserID: userIdentifier) { state, _ in
            let value: String
            switch state {
            case .authorized: value = "authorized"
            case .revoked: value = "revoked"
            case .notFound: value = "notFound"
            case .transferred: value = "transferred"
            @unknown default: value = "unknown"
            }
            DispatchQueue.main.async { call.resolve(["state": value]) }
        }
    }

    @objc func authorize(_ call: CAPPluginCall) {
        guard pendingCall == nil else {
            call.reject("Apple authentication is already in progress.", "APPLE_AUTH_IN_PROGRESS")
            return
        }
        guard let state = call.getString("state"), !state.isEmpty,
              let nonce = call.getString("nonce"), !nonce.isEmpty else {
            call.reject("Apple authentication challenge is invalid.", "APPLE_AUTH_CHALLENGE_INVALID")
            return
        }
        pendingCall = call
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.state = state
        request.nonce = nonce
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        DispatchQueue.main.async { controller.performRequests() }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let identityData = credential.identityToken,
              let identityToken = String(data: identityData, encoding: .utf8),
              let codeData = credential.authorizationCode,
              let authorizationCode = String(data: codeData, encoding: .utf8) else {
            call.reject("Apple did not return a verifiable credential.", "APPLE_AUTH_CREDENTIAL_INVALID")
            return
        }
        UserDefaults.standard.set(credential.user, forKey: appleUserKey)
        call.resolve([
            "state": credential.state ?? "",
            "identityToken": identityToken,
            "authorizationCode": authorizationCode,
            "givenName": credential.fullName?.givenName ?? "",
            "familyName": credential.fullName?.familyName ?? ""
        ])
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        if (error as? ASAuthorizationError)?.code == .canceled {
            call.reject("Apple authentication was cancelled.", "APPLE_AUTH_CANCELLED")
        } else {
            call.reject("Apple authentication failed.", "APPLE_AUTH_FAILED")
        }
    }
}
