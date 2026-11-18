import Capacitor
import AVFoundation
import PhotosUI
import UIKit

@objc(CalistheniNutritionPhotoPickerPlugin)
public class CalistheniNutritionPhotoPickerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CalistheniNutritionPhotoPickerPlugin"
    public let jsName = "CalistheniNutritionPhotoPicker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPhoto", returnType: CAPPluginReturnPromise)
    ]

    private var activeCall: CAPPluginCall?

    @objc func getPhoto(_ call: CAPPluginCall) {
        guard activeCall == nil else {
            call.reject("A photo selection is already active.", "PHOTO_PICKER_BUSY")
            return
        }
        guard let source = call.getString("source"),
              source == "camera" || source == "gallery" else {
            call.reject("Choose a supported photo source.", "PHOTO_SOURCE_INVALID")
            return
        }

        activeCall = call
        DispatchQueue.main.async { [weak self] in
            if source == "gallery" {
                self?.presentPhotoPicker()
            } else {
                self?.requestCameraAccessAndPresent()
            }
        }
    }

    private func presentPhotoPicker() {
        guard activeCall != nil, let presenter = bridge?.viewController else {
            finishWithError("Unable to open the photo picker.", code: "PHOTO_PICKER_UNAVAILABLE")
            return
        }
        var configuration = PHPickerConfiguration()
        configuration.filter = .images
        configuration.selectionLimit = 1
        let picker = PHPickerViewController(configuration: configuration)
        picker.delegate = self
        presenter.present(picker, animated: true)
    }

    private func requestCameraAccessAndPresent() {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            finishWithError("Camera is unavailable on this device.", code: "CAMERA_UNAVAILABLE")
            return
        }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            presentCamera()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    guard let self else { return }
                    if granted {
                        self.presentCamera()
                    } else {
                        self.finishWithError("Camera permission was denied.", code: "CAMERA_PERMISSION_DENIED")
                    }
                }
            }
        case .denied, .restricted:
            finishWithError("Camera permission was denied.", code: "CAMERA_PERMISSION_DENIED")
        @unknown default:
            finishWithError("Camera permission is unavailable.", code: "CAMERA_PERMISSION_UNAVAILABLE")
        }
    }

    private func presentCamera() {
        guard activeCall != nil,
              let presenter = bridge?.viewController else {
            finishWithError("Unable to open the camera.", code: "CAMERA_UNAVAILABLE")
            return
        }
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = self
        picker.modalPresentationStyle = .fullScreen
        presenter.present(picker, animated: true)
    }

    private func finishWithImage(_ image: UIImage) {
        guard let jpeg = image.jpegData(compressionQuality: 0.9) else {
            finishWithError("The selected photo could not be prepared.", code: "PHOTO_PREPARATION_FAILED")
            return
        }
        let call = activeCall
        activeCall = nil
        call?.resolve(["base64String": jpeg.base64EncodedString(), "cancelled": false])
    }

    private func finishWithCancellation() {
        let call = activeCall
        activeCall = nil
        call?.resolve(["cancelled": true])
    }

    private func finishWithError(_ message: String, code: String) {
        let call = activeCall
        activeCall = nil
        call?.reject(message, code)
    }
}

extension CalistheniNutritionPhotoPickerPlugin: PHPickerViewControllerDelegate {
    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true) { [weak self] in
            guard let self else { return }
            guard let result = results.first else {
                self.finishWithCancellation()
                return
            }
            guard result.itemProvider.canLoadObject(ofClass: UIImage.self) else {
                self.finishWithError("The selected photo could not be loaded.", code: "PHOTO_LOAD_FAILED")
                return
            }
            result.itemProvider.loadObject(ofClass: UIImage.self) { [weak self] object, _ in
                DispatchQueue.main.async {
                    guard let self else { return }
                    guard let image = object as? UIImage else {
                        self.finishWithError("The selected photo could not be loaded.", code: "PHOTO_LOAD_FAILED")
                        return
                    }
                    self.finishWithImage(image)
                }
            }
        }
    }
}

extension CalistheniNutritionPhotoPickerPlugin: UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    public func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true) { [weak self] in
            self?.finishWithCancellation()
        }
    }

    public func imagePickerController(
        _ picker: UIImagePickerController,
        didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
        let image = (info[.editedImage] as? UIImage) ?? (info[.originalImage] as? UIImage)
        picker.dismiss(animated: true) { [weak self] in
            guard let self, let image else {
                self?.finishWithError("The captured photo could not be loaded.", code: "PHOTO_LOAD_FAILED")
                return
            }
            self.finishWithImage(image)
        }
    }
}
