import AVFoundation
import Capacitor
import UIKit

@objc(NutritionBarcodeScannerPlugin)
public class NutritionBarcodeScannerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NutritionBarcodeScannerPlugin"
    public let jsName = "NutritionBarcodeScanner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isTorchAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "toggleTorch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isTorchEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]

    // The plugin deliberately owns the presented controller until UIKit has
    // completed dismissal and the result has crossed the Capacitor bridge.
    private var activeScannerViewController: BarcodeScannerViewController?
    private var isDismissingScanner = false

    private func debugLog(_ message: String) {
        #if DEBUG
        print("[BarcodeScanner] \(message)")
        #endif
    }

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) != nil])
    }

    @objc public override func checkPermissions(_ call: CAPPluginCall) {
        call.resolve(["camera": permission()])
    }

    @objc public override func requestPermissions(_ call: CAPPluginCall) {
        AVCaptureDevice.requestAccess(for: .video) { [weak self] _ in
            call.resolve(["camera": self?.permission() ?? "denied"])
        }
    }

    @objc func startScan(_ call: CAPPluginCall) {
        guard permission() == "granted" else {
            call.reject("Camera permission is required.")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard self.activeScannerViewController == nil else {
                call.reject("A barcode scanner is already open.")
                return
            }
            guard let presentingController = self.bridge?.viewController else {
                call.reject("Unable to present the native barcode scanner.")
                return
            }

            self.debugLog("presenting native scanner")
            let scanner = BarcodeScannerViewController()
            scanner.modalPresentationStyle = .fullScreen
            scanner.modalTransitionStyle = .crossDissolve
            scanner.onResult = { [weak self] result in
                guard let self else { return }
                self.finishActiveScanner(with: result)
            }
            self.activeScannerViewController = scanner
            presentingController.present(scanner, animated: true) {
                call.resolve()
            }
        }
    }

    @objc func stopScan(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self, let scanner = self.activeScannerViewController else {
                call.resolve()
                return
            }
            self.debugLog("native scanner stop requested")
            self.dismiss(scanner, emit: nil) {
                call.resolve()
            }
        }
    }

    @objc func isTorchAvailable(_ call: CAPPluginCall) {
        activeScannerViewController?.torchAvailability { available in call.resolve(["available": available]) }
            ?? call.resolve(["available": false])
    }

    @objc func toggleTorch(_ call: CAPPluginCall) {
        guard let scanner = activeScannerViewController else { call.resolve(); return }
        scanner.toggleTorch { result in
            switch result {
            case .success: call.resolve()
            case .failure(let error): call.reject("Unable to change flash.", nil, error)
            }
        }
    }

    @objc func isTorchEnabled(_ call: CAPPluginCall) {
        activeScannerViewController?.torchEnabled { enabled in call.resolve(["enabled": enabled]) }
            ?? call.resolve(["enabled": false])
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
        call.resolve()
    }

    private func permission() -> String {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: return "granted"
        case .notDetermined: return "prompt"
        default: return "denied"
        }
    }

    private func finishActiveScanner(with result: BarcodeScannerResult) {
        DispatchQueue.main.async { [weak self] in
            guard let self, let scanner = self.activeScannerViewController else { return }
            self.dismiss(scanner, emit: result)
        }
    }

    private func dismiss(
        _ scanner: BarcodeScannerViewController,
        emit result: BarcodeScannerResult?,
        completion: (() -> Void)? = nil
    ) {
        guard !isDismissingScanner, activeScannerViewController === scanner else {
            completion?()
            return
        }
        isDismissingScanner = true
        scanner.prepareForDismissal { [weak self, scanner] in
            guard let self else { return }
            self.debugLog("dismiss begin")
            scanner.dismiss(animated: true) { [weak self, scanner] in
                guard let self else { return }
                self.debugLog("dismiss complete")
                if let result {
                    self.emit(result)
                }
                if self.activeScannerViewController === scanner {
                    self.activeScannerViewController = nil
                    self.debugLog("active scanner cleared")
                }
                self.isDismissingScanner = false
                completion?()
            }
        }
    }

    private func emit(_ result: BarcodeScannerResult) {
        switch result {
        case .barcode(let value):
            debugLog("emitting barcode result to JS")
            notifyListeners("barcodesScanned", data: ["barcodes": [["displayValue": value]]])
        case .manual:
            debugLog("emitting manual result to JS")
            notifyListeners("manualRequested", data: [:])
        case .cancelled:
            debugLog("emitting cancellation result to JS")
            notifyListeners("scannerCancelled", data: [:])
        case .failure(let message):
            debugLog("emitting scanner error to JS")
            notifyListeners("scannerError", data: ["message": message])
        }
    }
}
