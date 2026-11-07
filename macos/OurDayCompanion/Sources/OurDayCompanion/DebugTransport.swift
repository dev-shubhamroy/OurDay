import Foundation

/// Wraps the real transport so tests (with --debug) can simulate outages. Normal builds never change mode.
final class DebugTransport: HTTPTransport {
    enum Mode: String { case normal, offline, server }
    var mode: Mode = .normal
    private let inner: HTTPTransport
    init(_ inner: HTTPTransport) { self.inner = inner }
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        switch mode {
        case .normal: return try await inner.send(request)
        case .offline: throw URLError(.notConnectedToInternet)
        case .server: return (Data(), HTTPURLResponse(url: request.url!, statusCode: 503, httpVersion: nil, headerFields: nil)!)
        }
    }
}
