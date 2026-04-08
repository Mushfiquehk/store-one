import Foundation
import Capacitor
import GCDWebServer

@objc(CornerPOSHttpServerPlugin)
public class CornerPOSHttpServerPlugin: CAPPlugin {

    private var webServer: GCDWebServer?
    private var pendingRequests: [String: GCDWebServerCompletionBlock] = [:]

    @objc func start(_ call: CAPPluginCall) {
        let port = call.getInt("port") ?? 8080
        let hostname = call.getString("hostname") ?? "127.0.0.1"

        webServer = GCDWebServer()
        guard let server = webServer else {
            call.reject("Failed to create server")
            return
        }

        server.addDefaultHandler(forMethod: "GET", request: GCDWebServerRequest.self) { [weak self] request, completionBlock in
            self?.handleRequest(request: request, completionBlock: completionBlock)
        }
        server.addDefaultHandler(forMethod: "POST", request: GCDWebServerDataRequest.self) { [weak self] request, completionBlock in
            self?.handleRequest(request: request, completionBlock: completionBlock)
        }
        server.addDefaultHandler(forMethod: "PUT", request: GCDWebServerDataRequest.self) { [weak self] request, completionBlock in
            self?.handleRequest(request: request, completionBlock: completionBlock)
        }
        server.addDefaultHandler(forMethod: "DELETE", request: GCDWebServerRequest.self) { [weak self] request, completionBlock in
            self?.handleRequest(request: request, completionBlock: completionBlock)
        }
        server.addDefaultHandler(forMethod: "OPTIONS", request: GCDWebServerRequest.self) { _, completionBlock in
            let response = GCDWebServerResponse(statusCode: 204)
            response.setValue("*", forAdditionalHeader: "Access-Control-Allow-Origin")
            response.setValue("GET, POST, PUT, DELETE, OPTIONS", forAdditionalHeader: "Access-Control-Allow-Methods")
            response.setValue("Content-Type", forAdditionalHeader: "Access-Control-Allow-Headers")
            completionBlock(response)
        }

        do {
            try server.start(options: [
                GCDWebServerOption_Port: port,
                GCDWebServerOption_BindToLocalhost: (hostname == "127.0.0.1"),
                GCDWebServerOption_AutomaticallySuspendInBackground: false,
            ])
            call.resolve()
        } catch {
            call.reject("Failed to start server: \(error.localizedDescription)")
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        webServer?.stop()
        webServer = nil
        pendingRequests.removeAll()
        call.resolve()
    }

    @objc func respond(_ call: CAPPluginCall) {
        guard let requestId = call.getString("requestId"),
              let completionBlock = pendingRequests.removeValue(forKey: requestId) else {
            return
        }

        let status = call.getInt("status") ?? 200
        let body = call.getString("body") ?? "{}"
        let headers = call.getObject("headers") as? [String: String] ?? [:]

        let response = GCDWebServerDataResponse(data: body.data(using: .utf8)!, contentType: "application/json")
        response.statusCode = status
        for (key, value) in headers {
            response.setValue(value, forAdditionalHeader: key)
        }

        completionBlock(response)
    }

    private func handleRequest(request: GCDWebServerRequest, completionBlock: @escaping GCDWebServerCompletionBlock) {
        let requestId = UUID().uuidString
        pendingRequests[requestId] = completionBlock

        var bodyString: String? = nil
        if let dataRequest = request as? GCDWebServerDataRequest,
           let data = dataRequest.data {
            bodyString = String(data: data, encoding: .utf8)
        }

        notifyListeners("request", data: [
            "requestId": requestId,
            "method": request.method,
            "path": request.path,
            "body": bodyString ?? "",
        ])
    }
}
