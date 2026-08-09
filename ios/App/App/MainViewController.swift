import Capacitor

class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginType(NutritionBarcodeScannerPlugin.self)
    }
}
