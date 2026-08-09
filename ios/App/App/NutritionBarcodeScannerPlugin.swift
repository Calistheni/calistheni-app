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

    private weak var scannerController: BarcodeScannerViewController?

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
            guard self.scannerController == nil else {
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
            scanner.onResult = { [weak self, weak scanner] result in
                guard let self else { return }
                if self.scannerController === scanner {
                    self.scannerController = nil
                }
                switch result {
                case .barcode(let value):
                    self.debugLog("barcode detected")
                    self.notifyListeners("barcodesScanned", data: ["barcodes": [["displayValue": value]]])
                case .manual:
                    self.debugLog("manual entry requested")
                    self.notifyListeners("manualRequested", data: [:])
                case .cancelled:
                    self.debugLog("scanner cancelled")
                    self.notifyListeners("scannerCancelled", data: [:])
                case .failure(let message):
                    self.debugLog("scanner failed: \(message)")
                    self.notifyListeners("scannerError", data: ["message": message])
                }
            }
            self.scannerController = scanner
            presentingController.present(scanner, animated: true) {
                call.resolve()
            }
        }
    }

    @objc func stopScan(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self, let scanner = self.scannerController else {
                call.resolve()
                return
            }
            self.debugLog("native scanner stop requested")
            self.scannerController = nil
            scanner.stopAndDismiss(notifyResult: false) {
                call.resolve()
            }
        }
    }

    @objc func isTorchAvailable(_ call: CAPPluginCall) {
        scannerController?.torchAvailability { available in call.resolve(["available": available]) }
            ?? call.resolve(["available": false])
    }

    @objc func toggleTorch(_ call: CAPPluginCall) {
        guard let scanner = scannerController else { call.resolve(); return }
        scanner.toggleTorch { result in
            switch result {
            case .success: call.resolve()
            case .failure(let error): call.reject("Unable to change flash.", nil, error)
            }
        }
    }

    @objc func isTorchEnabled(_ call: CAPPluginCall) {
        scannerController?.torchEnabled { enabled in call.resolve(["enabled": enabled]) }
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
}
