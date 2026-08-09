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
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var camera: AVCaptureDevice?
    private var configured = false
    private weak var previewWebView: WKWebView?
    private var originalWebViewIsOpaque = true
    private var originalWebViewBackgroundColor: UIColor?
    private var originalScrollViewBackgroundColor: UIColor?

    @objc func isSupported(_ call: CAPPluginCall) { call.resolve(["supported": true]) }
    @objc public override func checkPermissions(_ call: CAPPluginCall) { call.resolve(["camera": permission()]) }
    @objc public override func requestPermissions(_ call: CAPPluginCall) {
        AVCaptureDevice.requestAccess(for: .video) { [weak self] _ in call.resolve(["camera": self?.permission() ?? "denied"]) }
    }
    @objc func startScan(_ call: CAPPluginCall) {
        guard permission() == "granted" else { call.reject("Camera permission is required."); return }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            do {
                try self.configureIfNeeded()
                self.showPreview()
                if !self.session.isRunning { self.session.startRunning() }
                call.resolve()
            } catch { call.reject("Unable to start the rear camera.", nil, error) }
        }
    }
    @objc func stopScan(_ call: CAPPluginCall) { stop(); call.resolve() }
    @objc func isTorchAvailable(_ call: CAPPluginCall) { call.resolve(["available": camera?.hasTorch ?? false]) }
    @objc func toggleTorch(_ call: CAPPluginCall) {
        guard let camera, camera.hasTorch else { call.resolve(); return }
        do { try camera.lockForConfiguration(); camera.torchMode = camera.torchMode == .on ? .off : .on; camera.unlockForConfiguration(); call.resolve() } catch { call.reject("Unable to change flash.", nil, error) }
    }
    @objc func isTorchEnabled(_ call: CAPPluginCall) { call.resolve(["enabled": camera?.torchMode == .on]) }
    @objc func openSettings(_ call: CAPPluginCall) { if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }; call.resolve() }

    private func permission() -> String { switch AVCaptureDevice.authorizationStatus(for: .video) { case .authorized: return "granted"; case .notDetermined: return "prompt"; default: return "denied" } }
    private func configureIfNeeded() throws {
        if configured { return }
        guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else { throw NSError(domain: "Calistheni", code: 1) }
        self.camera = camera
        session.beginConfiguration()
        session.sessionPreset = .hd1280x720
        session.addInput(try AVCaptureDeviceInput(device: camera))
        let output = AVCaptureMetadataOutput()
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        output.metadataObjectTypes = [.ean13, .ean8, .upce, .code128, .code39, .interleaved2of5, .itf14]
        session.commitConfiguration()
        configured = true
    }
    private func showPreview() {
        guard let webView, let superview = webView.superview else { return }
        previewLayer?.removeFromSuperlayer()
        previewWebView = webView
        originalWebViewIsOpaque = webView.isOpaque
        originalWebViewBackgroundColor = webView.backgroundColor
        originalScrollViewBackgroundColor = webView.scrollView.backgroundColor
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        preview.frame = superview.bounds
        superview.layer.insertSublayer(preview, below: webView.layer)
        previewLayer = preview
    }
    private func stop() {
        DispatchQueue.main.async {
            self.session.stopRunning()
            self.previewLayer?.removeFromSuperlayer()
            self.previewLayer = nil
            if let webView = self.previewWebView {
                webView.isOpaque = self.originalWebViewIsOpaque
                webView.backgroundColor = self.originalWebViewBackgroundColor
                webView.scrollView.backgroundColor = self.originalScrollViewBackgroundColor
            }
            self.previewWebView = nil
        }
    }
    public func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard let value = (metadataObjects.first as? AVMetadataMachineReadableCodeObject)?.stringValue else { return }
        notifyListeners("barcodesScanned", data: ["barcodes": [["displayValue": value]]])
    }
    deinit { stop() }
}
