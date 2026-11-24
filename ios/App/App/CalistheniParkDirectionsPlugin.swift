import Capacitor
import MapKit
import UIKit

@objc(CalistheniParkDirectionsPlugin)
final class CalistheniParkDirectionsPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "CalistheniParkDirectionsPlugin"
    let jsName = "CalistheniParkDirections"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "availableApps", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openDirections", returnType: CAPPluginReturnPromise),
    ]

    private let appleMaps = URL(string: "maps://")!
    private let googleMaps = URL(string: "comgooglemaps://")!

    @objc func availableApps(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve([
                "apple": UIApplication.shared.canOpenURL(self.appleMaps),
                "google": UIApplication.shared.canOpenURL(self.googleMaps),
            ])
        }
    }

    @objc func openDirections(_ call: CAPPluginCall) {
        guard let latitude = call.getDouble("lat"),
              let longitude = call.getDouble("lon"),
              latitude.isFinite, longitude.isFinite,
              let provider = call.getString("provider") else {
            call.resolve(["opened": false])
            return
        }

        let coordinate = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        guard CLLocationCoordinate2DIsValid(coordinate) else {
            call.resolve(["opened": false])
            return
        }

        DispatchQueue.main.async {
            let app = UIApplication.shared
            if provider == "apple", app.canOpenURL(self.appleMaps) {
                let destination = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
                destination.name = call.getString("name")
                let opened = destination.openInMaps(launchOptions: [
                    MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDefault,
                ])
                call.resolve(["opened": opened])
            } else if provider == "google", app.canOpenURL(self.googleMaps) {
                var url = URLComponents(url: self.googleMaps, resolvingAgainstBaseURL: false)
                url?.queryItems = [URLQueryItem(name: "daddr", value: "\(latitude),\(longitude)")]
                guard let directionsURL = url?.url else {
                    call.resolve(["opened": false])
                    return
                }
                app.open(directionsURL, options: [:]) { opened in
                    call.resolve(["opened": opened])
                }
            } else {
                call.resolve(["opened": false])
            }
        }
    }
}
