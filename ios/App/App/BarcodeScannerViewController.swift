import AVFoundation
import UIKit

enum BarcodeScannerResult {
    case barcode(String)
    case manual
    case cancelled
    case failure(String)
}

final class BarcodeScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onResult: ((BarcodeScannerResult) -> Void)?

    private let captureSession = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "com.calistheni.nutrition-barcode.capture-session")
    private var previewLayer: AVCaptureVideoPreviewLayer!
    private var camera: AVCaptureDevice?
    private var configured = false
    private var scanLocked = false
    private var completed = false
    private var captureWasInterrupted = false

    private let header = UIView()
    private let frameView = UIView()
    private let scanLine = UIView()
    private let instructionLabel = UILabel()
    private let flashButton = UIButton(type: .system)

    private let blue = UIColor(red: 37 / 255, green: 99 / 255, blue: 235 / 255, alpha: 1)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        buildInterface()
        previewLayer = AVCaptureVideoPreviewLayer(session: captureSession)
        previewLayer.videoGravity = .resizeAspectFill
        view.layer.insertSublayer(previewLayer, at: 0)
        installNotifications()
        configureCaptureSession()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        startCaptureIfNeeded()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        stopCapture()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer.frame = view.bounds
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        stopCapture()
        debugLog("BarcodeScannerViewController deinit")
    }

    // UIKit dismissal belongs to the Capacitor plugin. This controller only
    // stops capture and reports one terminal result to its strong owner.
    func prepareForDismissal(_ completion: @escaping () -> Void) {
        completed = true
        scanLocked = true
        stopCapture(completion: completion)
    }

    func torchAvailability(_ completion: @escaping (Bool) -> Void) {
        sessionQueue.async { [weak self] in
            let available = self?.camera?.hasTorch ?? false
            DispatchQueue.main.async { completion(available) }
        }
    }

    func torchEnabled(_ completion: @escaping (Bool) -> Void) {
        sessionQueue.async { [weak self] in
            let enabled = self?.camera?.torchMode == .on
            DispatchQueue.main.async { completion(enabled) }
        }
    }

    func toggleTorch(_ completion: @escaping (Result<Void, Error>) -> Void) {
        sessionQueue.async { [weak self] in
            guard let self, let camera = self.camera, camera.hasTorch else {
                DispatchQueue.main.async { completion(.success(())) }
                return
            }
            do {
                try camera.lockForConfiguration()
                camera.torchMode = camera.torchMode == .on ? .off : .on
                camera.unlockForConfiguration()
                DispatchQueue.main.async { completion(.success(())) }
            } catch {
                DispatchQueue.main.async { completion(.failure(error)) }
            }
        }
    }

    private func buildInterface() {
        header.translatesAutoresizingMaskIntoConstraints = false
        header.backgroundColor = UIColor.black.withAlphaComponent(0.45)
        view.addSubview(header)

        let backButton = UIButton(type: .system)
        backButton.translatesAutoresizingMaskIntoConstraints = false
        backButton.setImage(UIImage(systemName: "chevron.left"), for: .normal)
        backButton.setTitle(" Back", for: .normal)
        backButton.tintColor = .white
        backButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        backButton.accessibilityLabel = "Cancel barcode scan"
        backButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        header.addSubview(backButton)

        let title = UILabel()
        title.translatesAutoresizingMaskIntoConstraints = false
        title.text = "Scan"
        title.textColor = .white
        title.font = .systemFont(ofSize: 17, weight: .semibold)
        header.addSubview(title)

        frameView.translatesAutoresizingMaskIntoConstraints = false
        frameView.layer.borderColor = UIColor.white.withAlphaComponent(0.92).cgColor
        frameView.layer.borderWidth = 2
        frameView.layer.cornerRadius = 20
        frameView.isUserInteractionEnabled = false
        view.addSubview(frameView)

        scanLine.translatesAutoresizingMaskIntoConstraints = false
        scanLine.backgroundColor = blue
        scanLine.layer.cornerRadius = 1
        frameView.addSubview(scanLine)

        instructionLabel.translatesAutoresizingMaskIntoConstraints = false
        instructionLabel.text = "Align the barcode inside the frame"
        instructionLabel.textColor = .white
        instructionLabel.font = .systemFont(ofSize: 15, weight: .medium)
        instructionLabel.textAlignment = .center
        instructionLabel.numberOfLines = 0
        view.addSubview(instructionLabel)

        let manualButton = scannerButton(title: "Manual entry", image: "barcode")
        manualButton.addTarget(self, action: #selector(manualTapped), for: .touchUpInside)
        view.addSubview(manualButton)

        flashButton.translatesAutoresizingMaskIntoConstraints = false
        flashButton.configuration = scannerButtonConfiguration(title: "Flash", image: "flashlight.on.fill")
        flashButton.accessibilityLabel = "Toggle flash"
        flashButton.addTarget(self, action: #selector(flashTapped), for: .touchUpInside)
        view.addSubview(flashButton)

        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: view.topAnchor),
            header.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            header.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            header.heightAnchor.constraint(equalToConstant: 104),
            backButton.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: 20),
            backButton.bottomAnchor.constraint(equalTo: header.bottomAnchor, constant: -16),
            backButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
            title.centerXAnchor.constraint(equalTo: header.centerXAnchor),
            title.centerYAnchor.constraint(equalTo: backButton.centerYAnchor),
            frameView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            frameView.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -36),
            frameView.widthAnchor.constraint(equalTo: view.widthAnchor, multiplier: 0.82),
            frameView.heightAnchor.constraint(equalTo: frameView.widthAnchor, multiplier: 0.55),
            scanLine.leadingAnchor.constraint(equalTo: frameView.leadingAnchor, constant: 18),
            scanLine.trailingAnchor.constraint(equalTo: frameView.trailingAnchor, constant: -18),
            scanLine.centerYAnchor.constraint(equalTo: frameView.centerYAnchor),
            scanLine.heightAnchor.constraint(equalToConstant: 3),
            instructionLabel.topAnchor.constraint(equalTo: frameView.bottomAnchor, constant: 24),
            instructionLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            instructionLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            manualButton.centerXAnchor.constraint(equalTo: view.centerXAnchor, constant: -76),
            manualButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
            manualButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
            flashButton.centerXAnchor.constraint(equalTo: view.centerXAnchor, constant: 76),
            flashButton.centerYAnchor.constraint(equalTo: manualButton.centerYAnchor),
            flashButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
        ])
        animateScanLine()
    }

    private func scannerButton(title: String, image: String) -> UIButton {
        let button = UIButton(type: .system)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.configuration = scannerButtonConfiguration(title: title, image: image)
        button.tintColor = .white
        return button
    }

    private func scannerButtonConfiguration(title: String, image: String) -> UIButton.Configuration {
        var configuration = UIButton.Configuration.tinted()
        configuration.title = title
        configuration.image = UIImage(systemName: image)
        configuration.imagePadding = 7
        configuration.baseForegroundColor = .white
        configuration.baseBackgroundColor = UIColor.black.withAlphaComponent(0.48)
        configuration.background.cornerRadius = 22
        configuration.contentInsets = NSDirectionalEdgeInsets(top: 10, leading: 15, bottom: 10, trailing: 15)
        return configuration
    }

    private func animateScanLine() {
        let animation = CABasicAnimation(keyPath: "position.y")
        animation.fromValue = 28
        animation.toValue = 1
        animation.duration = 1.45
        animation.autoreverses = true
        animation.repeatCount = .infinity
        animation.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        scanLine.layer.add(animation, forKey: "barcodeScanLine")
    }

    private func configureCaptureSession() {
        sessionQueue.async { [weak self] in
            guard let self, !self.configured else { return }
            do {
                guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
                    throw ScannerError.unavailable
                }
                let input = try AVCaptureDeviceInput(device: camera)
                let output = AVCaptureMetadataOutput()
                self.captureSession.beginConfiguration()
                self.captureSession.sessionPreset = .hd1280x720
                guard self.captureSession.canAddInput(input) else { throw ScannerError.input }
                self.captureSession.addInput(input)
                guard self.captureSession.canAddOutput(output) else { throw ScannerError.output }
                self.captureSession.addOutput(output)
                output.setMetadataObjectsDelegate(self, queue: .main)
                output.metadataObjectTypes = [.ean13, .ean8, .upce, .code128, .code39, .interleaved2of5, .itf14]
                self.captureSession.commitConfiguration()
                self.camera = camera
                self.configured = true
                self.debugLog("capture configured with rear camera")
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    self.flashButton.isHidden = !camera.hasTorch
                    if self.viewIfLoaded?.window != nil, !self.completed {
                        self.startCaptureIfNeeded()
                    }
                }
            } catch {
                self.captureSession.commitConfiguration()
                DispatchQueue.main.async { [weak self] in self?.complete(.failure("Unable to configure the rear camera.")) }
            }
        }
    }

    private func startCaptureIfNeeded() {
        sessionQueue.async { [weak self] in
            guard let self, self.configured, !self.completed, !self.captureSession.isRunning else { return }
            self.debugLog("capture start requested")
            self.captureSession.startRunning()
            self.debugLog("capture started: \(self.captureSession.isRunning)")
        }
    }

    private func stopCapture(completion: (() -> Void)? = nil) {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            if self.captureSession.isRunning {
                self.debugLog("capture stop requested")
                self.captureSession.stopRunning()
                self.debugLog("capture stopped")
            }
            guard let completion else { return }
            DispatchQueue.main.async(execute: completion)
        }
    }

    private func installNotifications() {
        NotificationCenter.default.addObserver(self, selector: #selector(applicationDidEnterBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(applicationWillEnterForeground), name: UIApplication.willEnterForegroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(captureRuntimeError(_:)), name: .AVCaptureSessionRuntimeError, object: captureSession)
        NotificationCenter.default.addObserver(self, selector: #selector(captureInterrupted(_:)), name: .AVCaptureSessionWasInterrupted, object: captureSession)
        NotificationCenter.default.addObserver(self, selector: #selector(captureInterruptionEnded(_:)), name: .AVCaptureSessionInterruptionEnded, object: captureSession)
    }

    @objc private func applicationDidEnterBackground() { stopCapture() }
    @objc private func applicationWillEnterForeground() {
        guard viewIfLoaded?.window != nil, !completed else { return }
        startCaptureIfNeeded()
    }
    @objc private func captureRuntimeError(_ notification: Notification) {
        let error = notification.userInfo?[AVCaptureSessionErrorKey] as? NSError
        debugLog("capture runtime error: \(error?.localizedDescription ?? "unknown")")
    }
    @objc private func captureInterrupted(_ notification: Notification) {
        captureWasInterrupted = true
        debugLog("capture interrupted")
    }
    @objc private func captureInterruptionEnded(_ notification: Notification) {
        captureWasInterrupted = false
        if viewIfLoaded?.window != nil, !completed { startCaptureIfNeeded() }
    }

    @objc private func manualTapped() { complete(.manual) }
    @objc private func cancelTapped() { complete(.cancelled) }
    @objc private func flashTapped() {
        toggleTorch { [weak self] result in
            if case .success = result { self?.flashButton.configuration?.image = UIImage(systemName: "flashlight.on.fill") }
        }
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard !scanLocked,
              let value = (metadataObjects.first as? AVMetadataMachineReadableCodeObject)?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines),
              value.range(of: "^[0-9]{8,14}$", options: .regularExpression) != nil else { return }
        scanLocked = true
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        complete(.barcode(value))
    }

    private func complete(_ result: BarcodeScannerResult) {
        guard !completed else { return }
        completed = true
        scanLocked = true
        debugLog("result accepted: \(result.description)")
        // The plugin strongly owns this controller until it dismisses and emits
        // the result, so keep this terminal handoff alive through session stop.
        stopCapture { [self] in onResult?(result) }
    }

    private func debugLog(_ message: String) {
        #if DEBUG
        print("[BarcodeScanner] \(message)")
        #endif
    }

    private enum ScannerError: Error { case unavailable, input, output }
}

private extension BarcodeScannerResult {
    var description: String {
        switch self {
        case .barcode: return "barcode"
        case .manual: return "manual"
        case .cancelled: return "cancelled"
        case .failure: return "failure"
        }
    }
}
