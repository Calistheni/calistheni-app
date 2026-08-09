import Capacitor

class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        // Capacitor 8 auto-registers CAPBridgedPlugin types listed in the
        // bundled capacitor.config.json. The build phase adds
        // NutritionBarcodeScannerPlugin there before resources are copied.
    }
}
