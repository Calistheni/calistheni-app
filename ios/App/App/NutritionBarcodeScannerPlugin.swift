import AVFoundation
import Capacitor
import UIKit
import WebKit

@objc(NutritionBarcodeScannerPlugin)
public class NutritionBarcodeScannerPlugin: CAPPlugin, CAPBridgedPlugin, AVCaptureMetadataOutputObjectsDelegate {
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

    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "com.calistheni.nutrition-barcode.capture-session")
    private var previewContainer: UIView?
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var camera: AVCaptureDevice?
    private var configured = false
    private weak var previewWebView: WKWebView?
    private var originalWebViewIsOpaque = true
    private var originalWebViewBackgroundColor: UIColor?
    private var originalScrollViewBackgroundColor: UIColor?
    private var sessionObservers: [NSObjectProtocol] = []

    private func debugLog(_ message: String) {
        #if DEBUG
        print("[BarcodeScanner] \(message)")
        #endif
    }

    private func describe(_ rect: CGRect) -> String {
        "(x:\(Int(rect.origin.x)), y:\(Int(rect.origin.y)), w:\(Int(rect.width)), h:\(Int(rect.height)))"
    }

    private func installSessionObserversIfNeeded() {
        guard sessionObservers.isEmpty else { return }
        let center = NotificationCenter.default
        sessionObservers.append(center.addObserver(
            forName: .AVCaptureSessionRuntimeError,
            object: session,
            queue: .main
        ) { [weak self] notification in
            let error = notification.userInfo?[AVCaptureSessionErrorKey] as? NSError
            self?.debugLog("runtime error: \(error?.domain ?? "unknown") \(error?.code ?? 0) \(error?.localizedDescription ?? "")")
        })
        sessionObservers.append(center.addObserver(
            forName: .AVCaptureSessionWasInterrupted,
            object: session,
            queue: .main
        ) { [weak self] notification in
            let reason = notification.userInfo?[AVCaptureSessionInterruptionReasonKey] ?? "unknown"
            self?.debugLog("capture session interrupted: reason=\(reason)")
        })
        sessionObservers.append(center.addObserver(
            forName: .AVCaptureSessionInterruptionEnded,
            object: session,
            queue: .main
        ) { [weak self] _ in self?.debugLog("capture session interruption ended") })
    }

    @objc func isSupported(_ call: CAPPluginCall) { call.resolve(["supported": true]) }
    @objc public override func checkPermissions(_ call: CAPPluginCall) { call.resolve(["camera": permission()]) }
    @objc public override func requestPermissions(_ call: CAPPluginCall) {
        AVCaptureDevice.requestAccess(for: .video) { [weak self] _ in call.resolve(["camera": self?.permission() ?? "denied"]) }
    }
    @objc func startScan(_ call: CAPPluginCall) {
        guard permission() == "granted" else { call.reject("Camera permission is required."); return }
        debugLog("plugin startScan entered")
        sessionQueue.async { [weak self] in
            guard let self else { return }
            do {
                try self.configureIfNeeded()
                var previewAttached = false
                DispatchQueue.main.sync { previewAttached = self.showPreview() }
                guard previewAttached else {
                    throw NSError(
                        domain: "Calistheni.NutritionBarcodeScanner",
                        code: 2,
                        userInfo: [NSLocalizedDescriptionKey: "Unable to attach the camera preview."]
                    )
                }
                if !self.session.isRunning {
                    self.debugLog("sessionQueue startRunning begin")
                    self.session.startRunning()
                }
                self.debugLog("capture session started: \(self.session.isRunning)")
                call.resolve()
            } catch {
                self.debugLog("capture session failed to start: \(error.localizedDescription)")
                call.reject("Unable to start the rear camera.", nil, error)
            }
        }
    }
    @objc func stopScan(_ call: CAPPluginCall) {
        debugLog("stopScan entered")
        stop { call.resolve() }
    }
    @objc func isTorchAvailable(_ call: CAPPluginCall) {
        sessionQueue.async { [weak self] in call.resolve(["available": self?.camera?.hasTorch ?? false]) }
    }
    @objc func toggleTorch(_ call: CAPPluginCall) {
        sessionQueue.async { [weak self] in
            guard let self, let camera = self.camera, camera.hasTorch else { call.resolve(); return }
            do {
                try camera.lockForConfiguration()
                camera.torchMode = camera.torchMode == .on ? .off : .on
                camera.unlockForConfiguration()
                call.resolve()
            } catch { call.reject("Unable to change flash.", nil, error) }
        }
    }
    @objc func isTorchEnabled(_ call: CAPPluginCall) {
        sessionQueue.async { [weak self] in call.resolve(["enabled": self?.camera?.torchMode == .on]) }
    }
    @objc func openSettings(_ call: CAPPluginCall) { if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }; call.resolve() }

    private func permission() -> String { switch AVCaptureDevice.authorizationStatus(for: .video) { case .authorized: return "granted"; case .notDetermined: return "prompt"; default: return "denied" } }
    private func configureIfNeeded() throws {
        if configured { return }
        guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else { throw NSError(domain: "Calistheni", code: 1) }
        self.camera = camera
        debugLog("camera device: \(camera.localizedName), position=\(camera.position.rawValue)")
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        session.sessionPreset = .hd1280x720
        let input = try AVCaptureDeviceInput(device: camera)
        guard session.canAddInput(input) else {
            throw NSError(domain: "Calistheni.NutritionBarcodeScanner", code: 3, userInfo: [NSLocalizedDescriptionKey: "Unable to add the rear camera input."])
        }
        session.addInput(input)
        debugLog("rear camera input added")
        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else {
            throw NSError(domain: "Calistheni.NutritionBarcodeScanner", code: 4, userInfo: [NSLocalizedDescriptionKey: "Unable to add barcode metadata output."])
        }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        output.metadataObjectTypes = [.ean13, .ean8, .upce, .code128, .code39, .interleaved2of5, .itf14]
        debugLog("metadata output added")
        installSessionObserversIfNeeded()
        configured = true
    }
    @discardableResult
    private func showPreview() -> Bool {
        guard let webView, let superview = webView.superview else { return false }
        let rootViewController = bridge?.viewController
        debugLog("rootViewController = \(String(describing: rootViewController))")
        debugLog("rootView bounds = \(describe(rootViewController?.view.bounds ?? .zero))")
        debugLog("webView frame = \(describe(webView.frame)), bounds = \(describe(webView.bounds)), isOpaque = \(webView.isOpaque)")
        debugLog("webView background = \(String(describing: webView.backgroundColor)), scroll background = \(String(describing: webView.scrollView.backgroundColor))")
        debugLog("webView superview = \(String(describing: superview)), frame = \(describe(superview.frame)), bounds = \(describe(superview.bounds))")
        debugLog("root subviews = \(rootViewController?.view.subviews.map { String(describing: type(of: $0)) } ?? [])")
        previewLayer?.removeFromSuperlayer()
        previewContainer?.removeFromSuperview()
        previewWebView = webView
        originalWebViewIsOpaque = webView.isOpaque
        originalWebViewBackgroundColor = webView.backgroundColor
        originalScrollViewBackgroundColor = webView.scrollView.backgroundColor
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        let container = UIView(frame: superview.bounds)
        container.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        container.isUserInteractionEnabled = false
        #if DEBUG
        container.backgroundColor = .systemPink
        #else
        container.backgroundColor = .clear
        #endif
        superview.insertSubview(container, belowSubview: webView)
        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        preview.frame = container.bounds
        container.layer.addSublayer(preview)
        previewContainer = container
        previewLayer = preview
        container.setNeedsLayout()
        container.layoutIfNeeded()
        preview.frame = container.bounds
        debugLog("previewContainer frame = \(describe(container.frame)), bounds = \(describe(container.bounds)), superview = \(String(describing: container.superview))")
        debugLog("previewLayer frame = \(describe(preview.frame)), superlayer = \(String(describing: preview.superlayer))")
        debugLog("webView after transparency: isOpaque = \(webView.isOpaque), background = \(String(describing: webView.backgroundColor)), scroll background = \(String(describing: webView.scrollView.backgroundColor))")
        debugLog("preview layer attached")
        return true
    }
    private func stop(completion: (() -> Void)? = nil) {
        sessionQueue.async {
            if self.session.isRunning {
                self.debugLog("sessionQueue stopRunning")
                self.session.stopRunning()
            }
            DispatchQueue.main.async {
                self.previewLayer?.removeFromSuperlayer()
                self.previewLayer = nil
                self.previewContainer?.removeFromSuperview()
                self.previewContainer = nil
                if let webView = self.previewWebView {
                    webView.isOpaque = self.originalWebViewIsOpaque
                    webView.backgroundColor = self.originalWebViewBackgroundColor
                    webView.scrollView.backgroundColor = self.originalScrollViewBackgroundColor
                }
                self.previewWebView = nil
                self.debugLog("preview removed / capture session stopped")
                completion?()
            }
        }
    }
    public func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard let value = (metadataObjects.first as? AVMetadataMachineReadableCodeObject)?.stringValue else { return }
        notifyListeners("barcodesScanned", data: ["barcodes": [["displayValue": value]]])
    }
    deinit {
        for observer in sessionObservers { NotificationCenter.default.removeObserver(observer) }
        stop()
    }
}
