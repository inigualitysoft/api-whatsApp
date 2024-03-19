const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");

const fs = require('fs');
const log = (pino = require("pino"));
const { session } = { session: "session_auth_info" };
const { Boom } = require("@hapi/boom");
const cors = require("cors");
const bodyParser = require("body-parser");
const app = require("express")();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
const server = require("http").createServer(app);
const io = require("socket.io")(server, {
  cors: { origin: '*' }
});
const port = process.env.PORT || 8000;
const qrcode = require("qrcode");

let sock;
let qrDinamic;
let soket;
const carpetaAEliminar = './session_auth_info';

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("session_auth_info");

  sock = makeWASocket({
    printQRInTerminal: true,
    auth: state,
    logger: log({ level: "silent" }),
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    qrDinamic = qr;
    try {
      if (connection === "close") {
        let reason = new Boom(lastDisconnect.error).output.statusCode;
        if (reason === DisconnectReason.badSession) {
          console.log(`Bad Session File, Please Delete ${session} and Scan Again`);
          sock.logout();
        } else if (reason === DisconnectReason.connectionClosed) {
          console.log("Conexión cerrada, reconectando....");
          connectToWhatsApp();
        } else if (reason === DisconnectReason.connectionLost) {
          console.log("Conexión perdida del servidor, reconectando...");
          connectToWhatsApp();
        } else if (reason === DisconnectReason.connectionReplaced) {
          console.log("Conexión reemplazada, otra nueva sesión abierta, cierre la sesión actual primero");
          sock.logout();
        } else if (reason === DisconnectReason.loggedOut) {
          console.log(`Dispositivo cerrado, elimínelo ${session} y escanear de nuevo.`);
          fs.rmSync(carpetaAEliminar, { recursive: true, force: true });
          sock.logout();
          connectToWhatsApp();
        } else if (reason === DisconnectReason.restartRequired) {
          console.log("Se requiere reinicio, reiniciando...");
          connectToWhatsApp();
        } else if (reason === DisconnectReason.timedOut) {
          console.log("Se agotó el tiempo de conexión, conectando...");
          connectToWhatsApp();
        } else {
          sock.end(`Motivo de desconexión desconocido: ${reason}|${lastDisconnect.error}`);
        }
      } else if (connection === "open") {
        console.log("conexión abierta");
        updateQR("connected");
        return;
      }
    } catch (error) {
      console.log("salio mal");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    try {
      // if (type === "notify") {
      //   if (!messages[0]?.key.fromMe) {
      //     const captureMessage = messages[0]?.message?.conversation;
      //     const numberWa = messages[0]?.key?.remoteJid;

      //     const compareMessage = captureMessage.toLocaleLowerCase();

      //     if (compareMessage === "ping") {
      //       await sock.sendMessage(
      //         numberWa,
      //         {
      //           text: "Pong",
      //         },
      //         {
      //           quoted: messages[0],
      //         }
      //       );
      //     } else {
      //       await sock.sendMessage(
      //         numberWa,
      //         {
      //           text: "Soy un robot",
      //         },
      //         {
      //           quoted: messages[0],
      //         }
      //       );
      //     }
      //   }
      // }
    } catch (error) {
      console.log("error ", error);
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

const isConnected = () => {
  return sock?.user ? true : false;
};

app.post("/send-comprobantes", async (req, res) => {
  const {
    urlPDF,
    urlXML,
    number,
    cliente,
    num_comprobante,
    clave_acceso
  } = req.body;

  try {
      let numberWA = "593" + number + "@s.whatsapp.net";

      if (isConnected()) {

        const exist = await sock.onWhatsApp(numberWA);

        if (exist?.jid || (exist && exist[0]?.jid)) {

          try {
            await sock.sendMessage(exist.jid || exist[0].jid, {
              text: `Estimado(a): ${ cliente } se ha emitido la siguiente factura a su nombre: \nFactura: ${ num_comprobante }`
            });

            await sock.sendMessage(exist.jid || exist[0].jid, {
              text: `A continuacion enviamos adjunto el comprobante electronico en formato XML y su interpretacion en formato PDF ELECTRONICO(A)`
            });

            await sock.sendMessage(exist.jid || exist[0].jid, {
              document: { url: urlXML },
              fileName: `${ clave_acceso }.xml`,
              Mimetype: "application/xml"
            })

            await sock.sendMessage(exist.jid || exist[0].jid, {
              document: { url: urlPDF },
              fileName: `${ clave_acceso }.pdf`,
              Mimetype: "application/pdf"
            });

            res.status(200).json({
              status: true,
              response: response,
            });
          } catch (error) {
            res.status(500).json({
              status: false,
              response: error,
            });
          }
        }
      } else {
        res.status(500).json({
          status: false,
          response: "Aun no estas conectado",
        });
      }

  } catch (err) {
    res.status(500).send(err);
  }
});
app.get("/", async (req, res) => {
  res.send('ok')
});

io.on("connection", async (socket) => {
  soket = socket;
  if (isConnected()) {
    updateQR("connected");
  } else if (qrDinamic) {
    updateQR("qr");
  }
});

const updateQR = (data) => {
  switch (data) {
    case "qr":
      qrcode.toDataURL(qrDinamic, (err, url) => {
        soket?.emit("qr", url);
        soket?.emit("log", "QR recibido , scan");
      });
      break;
    case "connected":
      soket?.emit("qrstatus", "/imgs/check.svg");
      soket?.emit("log", " usaario conectado");
      const { id, name } = sock?.user;
      var userinfo = id + " " + name;
      soket?.emit("user", userinfo);

      break;
    case "loading":
      soket?.emit("qrstatus", "./assets/loader.gif");
      soket?.emit("log", "Cargando ....");
      break;
    default:
      break;
  }
};

connectToWhatsApp().catch((err) => console.log("unexpected error: " + err)); // catch any errors
server.listen(port, () => {
  console.log("Server Run Port : " + port);
});
