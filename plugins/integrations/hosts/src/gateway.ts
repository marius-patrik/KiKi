/**
 * Loopback Access Gateway for hosts.
 * Binds the public/Tailscale port and transparently proxies to the local 127.0.0.1 harness backend.
 */

import http from "node:http";
import net from "node:net";
import type { AccessConfig } from "./types.js";

const UUID_POLYFILL = `<script>(function(){
  if(typeof globalThis.crypto==='undefined')globalThis.crypto={};
  if(typeof globalThis.crypto.randomUUID!=='function'){
    globalThis.crypto.randomUUID=function(){
      if(typeof globalThis.crypto.getRandomValues==='function'){
        try{
          return([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,function(c){
            return(c^(globalThis.crypto.getRandomValues(new Uint8Array(1))[0]&(15>>(c/4)))).toString(16);
          });
        }catch(e){}
      }
      return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){
        var r=(Math.random()*16)|0,v=c==='x'?r:(r&0x3)|0x8;
        return v.toString(16);
      });
    };
  }
})();</script>`;

export class AccessGateway {
  private server: http.Server | null = null;
  private running = false;

  /** Constructs an instance. */
  constructor(private config: AccessConfig) {}

  /**
   * Starts the server if not already running. Resolves the promise if the server was not running,
   * otherwise rejects the promise to prevent starting the server again.
   *
   * @returns A promise that resolves if the server starts successfully and rejects if it is already running.
   */
  start(): Promise<void> {
    if (this.running) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const { gatewayPort, backendPort } = this.config;

      this.server = http.createServer(
        (clientReq: http.IncomingMessage, clientRes: http.ServerResponse) => {
          const loopbackHost = `127.0.0.1:${backendPort}`;
          const loopbackOrigin = `http://127.0.0.1:${backendPort}`;

          const headers: http.OutgoingHttpHeaders = { ...clientReq.headers };
          headers.host = loopbackHost;
          if (headers.origin) headers.origin = loopbackOrigin;
          headers["sec-fetch-site"] = "same-origin";
          delete headers["accept-encoding"]; // prevent gzip so HTML modification works cleanly

          const options: http.RequestOptions = {
            hostname: "127.0.0.1",
            port: backendPort,
            path: clientReq.url,
            method: clientReq.method,
            headers,
          };

          const isHtml =
            clientReq.url === "/" ||
            clientReq.url?.startsWith("/?") ||
            clientReq.url?.includes(".html");

          const proxyReq = http.request(options, (proxyRes: http.IncomingMessage) => {
            const contentType = (proxyRes.headers["content-type"] || "").toLowerCase();
            if (isHtml && contentType.includes("text/html")) {
              let body = "";
              proxyRes.on("data", (chunk) => {
                body += chunk;
              });
              proxyRes.on("end", () => {
                const injected = body.includes("<head>")
                  ? body.replace("<head>", "<head>" + UUID_POLYFILL)
                  : UUID_POLYFILL + body;
                const resHeaders = { ...proxyRes.headers };
                resHeaders["content-length"] = Buffer.byteLength(injected).toString();
                clientRes.writeHead(proxyRes.statusCode || 200, resHeaders);
                clientRes.end(injected);
              });
              return;
            }

            clientRes.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
            proxyRes.pipe(clientRes, { end: true });
          });

          proxyReq.on("error", (err: Error) => {
            if (!clientRes.headersSent) {
              clientRes.writeHead(502, { "Content-Type": "text/plain" });
              clientRes.end(
                `dsh gateway: upstream harness unreachable on 127.0.0.1:${backendPort} (${err.message})`,
              );
            }
          });

          clientReq.pipe(proxyReq, { end: true });
        },
      );

      // WebSocket bridge for /api/events.host and /api/events.mux
      this.server.on("upgrade", (req: http.IncomingMessage, socket: net.Socket, head: Buffer) => {
        const proxySocket = net.connect(backendPort, "127.0.0.1", () => {
          const loopbackHost = `127.0.0.1:${backendPort}`;
          const loopbackOrigin = `http://127.0.0.1:${backendPort}`;

          let headers = `${req.method} ${req.url} HTTP/1.1\r\n`;
          const rawHeaders = req.rawHeaders || [];
          for (let i = 0; i < rawHeaders.length; i += 2) {
            const key = rawHeaders[i]!;
            let val = rawHeaders[i + 1]!;
            if (key.toLowerCase() === "host") val = loopbackHost;
            else if (key.toLowerCase() === "origin") val = loopbackOrigin;
            else if (key.toLowerCase() === "sec-fetch-site") val = "same-origin";
            headers += `${key}: ${val}\r\n`;
          }
          headers += "\r\n";

          proxySocket.write(headers);
          if (head && head.length > 0) proxySocket.write(head);
          socket.pipe(proxySocket).pipe(socket);
        });

        proxySocket.on("error", () => {
          socket.destroy();
        });
        socket.on("error", () => {
          proxySocket.destroy();
        });
      });

      this.server.listen(gatewayPort, "0.0.0.0", () => {
        this.running = true;
        resolve();
      });

      this.server.on("error", (err: Error) => {
        reject(err);
      });
    });
  }

  /**
   * Stops the server and cleanup resources.
   *
   * Guarantees that the server is properly closed, and the `running` state is set to false.
   * Returns a Promise that resolves when the server is stopped successfully.
   * Fails if the server is not running or has not been initialized.
   */
  stop(): Promise<void> {
    if (!this.running || !this.server) return Promise.resolve();
    return new Promise((resolve) => {
      this.server?.close(() => {
        this.running = false;
        this.server = null;
        resolve();
      });
    });
  }

  /**
   * Checks if the server is currently running.
   *
   * Guarantees that the server's running state is accurately reflected.
   * Returns `true` if the server is running, `false` otherwise.
   * Fails if the server's running state is undefined or not properly initialized.
   */
  isRunning(): boolean {
    return this.running;
  }
}
