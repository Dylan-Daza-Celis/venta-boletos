const express = require("express");
const fs = require("node:fs/promises");
const path = require("node:path");
const { XMLParser, XMLBuilder } = require("fast-xml-parser");
const { randomUUID, randomBytes, scryptSync, timingSafeEqual } = require("node:crypto");

const app = express();
const port = 3000;
const dataFile = path.join(__dirname, "data", "database.xml");
const imagesDirectory = path.join(__dirname, "public", "images");
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: true,
  suppressEmptyNode: true
});
const sessions = new Map();

app.use(express.json());
app.use("/views", express.static(path.join(__dirname, "views")));
app.use("/semantic", express.static(path.join(__dirname, "semantic")));
app.use(express.static(path.join(__dirname, "public")));

const resourceConfig = {
  conciertos: {
    singular: "concierto",
    required: ["nombre", "artista", "lugar", "fecha", "hora"]
  },
  compras: {
    singular: "compra",
    required: ["conciertoId", "tipoBoleto", "cantidad"]
  }
};

async function readDatabase() {
  const database = parser.parse(await fs.readFile(dataFile, "utf8"));
  let migratedPurchases = false;
  database.eventos ||= {};
  database.eventos.usuarios ||= {};
  database.eventos.usuarios.usuario = asArray(database.eventos.usuarios.usuario);
  if (!database.eventos.usuarios.usuario.some((user) => user.username === "admin")) {
    database.eventos.usuarios.usuario.push({
      "@_id": randomUUID(),
      username: "admin",
      password: hashPassword("admin"),
      rol: "admin"
    });
    migratedPurchases = true;
  }
  const users = usersOf(database);
  for (const purchase of collection(database, "compras")) {
    if (!purchase.usuarioId && purchase.usuario) {
      const legacyUser = users.find((user) => user.username === purchase.usuario);
      if (legacyUser) {
        purchase.usuarioId = itemId(legacyUser);
        delete purchase.usuario;
        delete purchase.nombreComprador;
        delete purchase.correo;
        delete purchase.telefono;
        migratedPurchases = true;
      }
    }
  }
  if (migratedPurchases) {
    await writeDatabase(database);
  }
  return database;
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function passwordMatches(password, storedPassword) {
  const [salt, storedHash] = String(storedPassword || "").split(":");
  if (!salt || !storedHash) return false;
  const hash = scryptSync(password, salt, 64);
  const expected = Buffer.from(storedHash, "hex");
  return expected.length === hash.length && timingSafeEqual(hash, expected);
}

function usersOf(database) {
  return asArray(database.eventos?.usuarios?.usuario);
}

function userDetails(database, username) {
  return usersOf(database).find((user) => user.username === username);
}

function userById(database, id) {
  return usersOf(database).find((user) => itemId(user) === id);
}

function sessionUserDetails(database, sessionUser) {
  return userById(database, sessionUser.id) || userDetails(database, sessionUser.username);
}

function isAdult(day, month, year) {
  const birthDate = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    !Number.isInteger(Number(day))
    || !Number.isInteger(Number(month))
    || !Number.isInteger(Number(year))
    || birthDate.getFullYear() !== Number(year)
    || birthDate.getMonth() !== Number(month) - 1
    || birthDate.getDate() !== Number(day)
  ) return false;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const birthdayPassed = today.getMonth() > birthDate.getMonth()
    || (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  if (!birthdayPassed) age -= 1;
  return age >= 18;
}

function validateUserDetails(data) {
  const required = ["nombre", "apellidoPaterno", "apellidoMaterno", "genero", "correo", "telefono", "diaNacimiento", "mesNacimiento", "anioNacimiento"];
  if (required.some((field) => !String(data[field] || "").trim())) return "Todos los datos personales son obligatorios.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.correo)) return "El correo electrónico no es válido.";
  if (!["Hombre", "Mujer", "Personalizado", "Prefiero no decirlo"].includes(data.genero)) return "Selecciona un género válido.";
  if (!isAdult(data.diaNacimiento, data.mesNacimiento, data.anioNacimiento)) return "Debes tener al menos 18 años y una fecha válida.";
  return null;
}

function currentUser(req) {
  const token = (req.headers.cookie || "").split(";").map((part) => part.trim())
    .find((part) => part.startsWith("sonora_session="))?.split("=")[1];
  return token ? sessions.get(token) : null;
}

function requireAuth(req, res) {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: "Debes iniciar sesión." });
    return null;
  }
  return user;
}

function requireRole(req, res, role) {
  const user = requireAuth(req, res);
  if (user && user.rol !== role) {
    res.status(403).json({ error: "No tienes permisos para realizar esta acción." });
    return null;
  }
  return user;
}

function itemId(item) {
  return item.id || item["@_id"];
}

function ticketsOf(concert) {
  if (Array.isArray(concert.boletos)) return concert.boletos;
  return asArray(concert.boletos?.boleto);
}

function publicItem(item) {
  const result = { ...item };
  if (result["@_id"]) {
    result.id = result["@_id"];
    delete result["@_id"];
  }

  if (result.boletos) result.boletos = ticketsOf(result);
  return result;
}

function publicPurchase(database, purchase) {
  const user = userById(database, purchase.usuarioId);
  return {
    ...publicItem(purchase),
    nombreComprador: user
      ? [user.nombre, user.apellidoPaterno, user.apellidoMaterno].filter(Boolean).join(" ") || user.username
      : purchase.nombreComprador || "Usuario no disponible",
    correo: user?.correo || purchase.correo || "",
    telefono: user?.telefono || purchase.telefono || ""
  };
}

async function writeDatabase(database) {
  const xml = builder.build(database)
    .replace(/^<\?xml[^>]*>\s*/i, "")
    .replace(/^<\?xml-stylesheet[^>]*>\s*/i, "");
  await fs.writeFile(
    dataFile,
    `<?xml version="1.0" encoding="UTF-8"?>\n<?xml-stylesheet type="text/xsl" href="/views/database.xsl"?>\n${xml}`,
    "utf8"
  );
}

function asArray(value) {
  return value ? (Array.isArray(value) ? value : [value]) : [];
}

function collection(database, resource) {
  const config = resourceConfig[resource];
  return asArray(database.eventos?.[resource]?.[config.singular]);
}

function userOwnsPurchase(purchase, user) {
  return user?.rol === "admin"
    || purchase.usuarioId === user?.id
    || purchase.usuario === user?.username;
}

function purchasesFor(database, concertId) {
  return collection(database, "compras").filter((purchase) => purchase.conciertoId === concertId);
}

function soldByTicket(database, concertId, ticketType, ignoredPurchaseId) {
  return purchasesFor(database, concertId)
    .filter((purchase) => itemId(purchase) !== ignoredPurchaseId && purchase.tipoBoleto === ticketType)
    .reduce((total, purchase) => total + Number(purchase.cantidad), 0);
}

function validateItem(resource, item, database) {
  const config = resourceConfig[resource];
  if (!config) return "Recurso no encontrado.";

  for (const field of config.required) {
    if (item[field] === undefined || item[field] === "") {
      return `El campo "${field}" es obligatorio.`;
    }
  }

  if (resource === "conciertos") {
    if (Number.isNaN(Date.parse(`${item.fecha}T${item.hora}`))) return "La fecha u hora no es válida.";
    const tickets = asArray(item.boletos?.boleto || item.boletos);
    if (!tickets.length) return "Agrega al menos un tipo de boleto.";
    if (tickets.some((ticket) => !ticket.tipo || !Number.isFinite(Number(ticket.precio)) || Number(ticket.precio) < 0 || !Number.isInteger(Number(ticket.disponibles)) || Number(ticket.disponibles) < 0)) {
      return "Cada boleto necesita tipo, precio válido y lugares disponibles.";
    }
    const concertId = item.id || item["@_id"];
    const existingTickets = new Set(tickets.map((ticket) => ticket.tipo));
    if (concertId) {
      const soldTypes = new Set(purchasesFor(database, concertId).map((purchase) => purchase.tipoBoleto));
      for (const soldType of soldTypes) {
        if (!existingTickets.has(soldType)) {
          return `No puedes eliminar el boleto ${soldType} porque ya tiene ventas.`;
        }
      }
    }
    for (const ticket of tickets) {
      if (concertId && Number(ticket.disponibles) < soldByTicket(database, concertId, ticket.tipo)) {
        return `El boleto ${ticket.tipo} no puede tener menos lugares que los ya vendidos.`;
      }
    }
  }

  if (resource === "compras") {
    const concert = collection(database, "conciertos").find((concertItem) => itemId(concertItem) === item.conciertoId);
    if (!concert) return "El concierto seleccionado no existe.";
    const quantity = Number(item.cantidad);
    if (!Number.isInteger(quantity) || quantity <= 0) return "La cantidad debe ser un entero positivo.";
    const ticket = ticketsOf(concert).find((ticketItem) => ticketItem.tipo === item.tipoBoleto);
    if (!ticket) return "El tipo de boleto seleccionado no existe.";
    const purchaseId = item.id || item["@_id"];
    const currentPurchase = purchaseId
      ? collection(database, "compras").find((purchase) => itemId(purchase) === purchaseId)
      : null;
    const returnedByEdit = currentPurchase
      && currentPurchase.conciertoId === item.conciertoId
      && currentPurchase.tipoBoleto === item.tipoBoleto
      ? Number(currentPurchase.cantidad)
      : 0;
    const available = Number(ticket.disponibles) + returnedByEdit;
    if (quantity > available) return "No hay suficientes boletos disponibles.";
  }

  return null;
}

function saveCollection(database, resource, items) {
  const config = resourceConfig[resource];
  database.eventos[resource] = { [config.singular]: items };
}

app.get("/catalogo", async (req, res, next) => {
  try {
    const user = currentUser(req);
    if (!user) return res.redirect("/login.html?returnTo=%2Fcatalogo");
    const database = await readDatabase();
    const purchases = collection(database, "compras").filter((purchase) => userOwnsPurchase(purchase, user));
    database.eventos.compras = {
      compra: purchases.map((purchase) => {
        const visiblePurchase = publicPurchase(database, purchase);
        delete visiblePurchase.id;
        return { "@_id": itemId(purchase), ...visiblePurchase };
      })
    };
    const xml = builder.build(database)
      .replace(/^<\?xml[^>]*>\s*/i, "")
      .replace(/^<\?xml-stylesheet[^>]*>\s*/i, "");
    res.type("application/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<?xml-stylesheet type="text/xsl" href="/views/database.xsl"?>\n${xml}`
    );
  } catch (error) {
    next(error);
  }
});

app.get("/api/imagenes", async (req, res, next) => {
  try {
    const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]);
    const files = await fs.readdir(imagesDirectory, { withFileTypes: true });
    res.json(
      files
        .filter((file) => file.isFile() && allowedExtensions.has(path.extname(file.name).toLowerCase()))
        .map((file) => ({ nombre: file.name, ruta: `/images/${encodeURIComponent(file.name)}` }))
    );
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", (req, res) => {
  const user = currentUser(req);
  if (!user) return res.json(null);
  readDatabase()
    .then((database) => {
      const profile = sessionUserDetails(database, user);
      if (!profile) return res.json(null);
      const { password, ...safeProfile } = profile;
      res.json({
        ...publicItem(safeProfile),
        perfilCompleto: !validateUserDetails(profile)
      });
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({ error: "No fue posible cargar el perfil." });
    });
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Usuario y contraseña son obligatorios." });
    const database = await readDatabase();
    const user = usersOf(database).find((item) => item.username === username);
    if (!user || !passwordMatches(password, user.password)) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }
    const token = randomUUID();
    sessions.set(token, { id: itemId(user), username: user.username, email: user.correo, rol: user.rol });
    res.setHeader("Set-Cookie", `sonora_session=${token}; HttpOnly; Path=/; SameSite=Lax`);
    res.json({ username: user.username, rol: user.rol });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", (req, res) => {
  const token = (req.headers.cookie || "").split(";").map((part) => part.trim())
    .find((part) => part.startsWith("sonora_session="))?.split("=")[1];
  if (token) sessions.delete(token);
  res.setHeader("Set-Cookie", "sonora_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
  res.status(204).end();
});

async function createUser(req, res, next, role) {
  try {
    if (role === "admin" && !requireRole(req, res, "admin")) return;
    const { username, password } = req.body;
    if (!username || !password || String(username).length < 3 || String(password).length < 4) {
      return res.status(400).json({ error: "El usuario debe tener al menos 3 caracteres y la contraseña 4." });
    }
    const detailsError = validateUserDetails(req.body);
    if (detailsError) return res.status(400).json({ error: detailsError });
    const database = await readDatabase();
    if (usersOf(database).some((user) => user.username === username)) {
      return res.status(409).json({ error: "Ese nombre de usuario ya está registrado." });
    }
    if (usersOf(database).some((user) => user.correo?.toLowerCase() === String(req.body.correo).toLowerCase())) {
      return res.status(409).json({ error: "Ese correo electrónico ya está registrado." });
    }
    const user = {
      "@_id": randomUUID(),
      username,
      password: hashPassword(password),
      nombre: req.body.nombre,
      apellidoPaterno: req.body.apellidoPaterno,
      apellidoMaterno: req.body.apellidoMaterno,
      diaNacimiento: req.body.diaNacimiento,
      mesNacimiento: req.body.mesNacimiento,
      anioNacimiento: req.body.anioNacimiento,
      genero: req.body.genero,
      correo: req.body.correo,
      telefono: req.body.telefono,
      rol: role
    };
    usersOf(database).push(user);
    await writeDatabase(database);
    res.status(201).json({ username: user.username, rol: user.rol });
  } catch (error) {
    next(error);
  }
}

app.post("/api/auth/register", (req, res, next) => createUser(req, res, next, "usuario"));
app.post("/api/auth/admins", (req, res, next) => createUser(req, res, next, "admin"));

app.put("/api/auth/profile", async (req, res, next) => {
  try {
    const sessionUser = requireAuth(req, res);
    if (!sessionUser) return;
    const database = await readDatabase();
    const users = usersOf(database);
    const userIndexById = users.findIndex((user) => itemId(user) === sessionUser.id);
    const index = userIndexById === -1
      ? users.findIndex((user) => user.username === sessionUser.username)
      : userIndexById;
    if (index === -1) return res.status(404).json({ error: "Usuario no encontrado." });

    const current = users[index];
    const username = String(req.body.username || "").trim();
    const details = { ...req.body, username };
    if (!username || username.length < 3) {
      return res.status(400).json({ error: "El usuario debe tener al menos 3 caracteres." });
    }
    const detailsError = validateUserDetails(details);
    if (detailsError) return res.status(400).json({ error: detailsError });
    if (users.some((user, userIndex) => userIndex !== index && user.username === username)) {
      return res.status(409).json({ error: "Ese nombre de usuario ya está registrado." });
    }
    if (users.some((user, userIndex) => userIndex !== index
      && user.correo?.toLowerCase() === String(details.correo).toLowerCase())) {
      return res.status(409).json({ error: "Ese correo electrónico ya está registrado." });
    }

    users[index] = {
      ...current,
      username,
      nombre: details.nombre,
      apellidoPaterno: details.apellidoPaterno,
      apellidoMaterno: details.apellidoMaterno,
      diaNacimiento: details.diaNacimiento,
      mesNacimiento: details.mesNacimiento,
      anioNacimiento: details.anioNacimiento,
      genero: details.genero,
      correo: details.correo,
      telefono: details.telefono
    };
    if (details.password) {
      if (String(details.password).length < 4) {
        return res.status(400).json({ error: "La contraseña debe tener al menos 4 caracteres." });
      }
      users[index].password = hashPassword(details.password);
    }
    if (username !== sessionUser.username) {
      sessions.forEach((value, token) => {
        if (value.username === sessionUser.username) {
          sessions.set(token, { ...value, username, email: details.correo });
        }
      });
    }
    await writeDatabase(database);
    const { password, ...safeProfile } = users[index];
    res.json(publicItem(safeProfile));
  } catch (error) {
    next(error);
  }
});

app.get("/api/:resource", async (req, res, next) => {
  try {
    if (!resourceConfig[req.params.resource]) return res.status(404).json({ error: "Recurso no encontrado." });
    const user = req.params.resource === "conciertos" ? currentUser(req) : requireAuth(req, res);
    if (req.params.resource === "compras" && !user) return;
    const database = await readDatabase();
    let items = collection(database, req.params.resource);
    if (req.params.resource === "compras") {
      items = items.filter((purchase) => userOwnsPurchase(purchase, user));
      return res.json(items.map((purchase) => publicPurchase(database, purchase)));
    }
    res.json(items.map(publicItem));
  } catch (error) {
    next(error);
  }
});

app.post("/api/:resource", async (req, res, next) => {
  try {
    if (!resourceConfig[req.params.resource]) return res.status(404).json({ error: "Recurso no encontrado." });
    const user = req.params.resource === "conciertos" ? requireRole(req, res, "admin") : requireAuth(req, res);
    if (!user) return;
    const database = await readDatabase();
    const requestItem = req.params.resource === "compras"
      ? { conciertoId: req.body.conciertoId, tipoBoleto: req.body.tipoBoleto, cantidad: req.body.cantidad }
      : req.body;
    const validationError = validateItem(req.params.resource, requestItem, database);
    if (validationError) return res.status(400).json({ error: validationError });

    const item = { "@_id": randomUUID(), ...requestItem };
    if (req.params.resource === "conciertos") {
      const { nombre, artista, lugar, fecha, hora, descripcion, imagen, boletos } = requestItem;
      Object.assign(item, { nombre, artista, lugar, fecha, hora, descripcion, imagen, boletos });
      item.boletos = { boleto: asArray(boletos) };
      for (const field of ["generalPrecio", "generalDisponibles", "vipPrecio", "vipDisponibles"]) {
        delete item[field];
      }
    }
    if (req.params.resource === "compras") {
      const concert = collection(database, "conciertos").find((value) => itemId(value) === item.conciertoId);
      const ticket = ticketsOf(concert).find((value) => value.tipo === item.tipoBoleto);
      ticket.disponibles = Number(ticket.disponibles) - Number(item.cantidad);
      item.fechaCompra = new Date().toISOString();
      item.usuarioId = user.id;
      delete item.nombreComprador;
      delete item.correo;
      delete item.telefono;
      saveCollection(database, "conciertos", collection(database, "conciertos"));
    }
    const items = collection(database, req.params.resource);
    items.push(item);
    saveCollection(database, req.params.resource, items);
    await writeDatabase(database);
    res.status(201).json(req.params.resource === "compras"
      ? publicPurchase(database, item)
      : publicItem(item));
  } catch (error) {
    next(error);
  }
});

app.put("/api/:resource/:id", async (req, res, next) => {
  try {
    if (!resourceConfig[req.params.resource]) return res.status(404).json({ error: "Recurso no encontrado." });
    const user = req.params.resource === "conciertos" ? requireRole(req, res, "admin") : requireAuth(req, res);
    if (!user) return;
    const database = await readDatabase();
    const items = collection(database, req.params.resource);
    const index = items.findIndex((item) => itemId(item) === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Registro no encontrado." });
    if (req.params.resource === "compras" && !userOwnsPurchase(items[index], user)) {
      return res.status(403).json({ error: "Solo puedes modificar tus propias compras." });
    }

    const requestItem = req.params.resource === "compras"
      ? { conciertoId: req.body.conciertoId, tipoBoleto: req.body.tipoBoleto, cantidad: req.body.cantidad }
      : req.body;
    const updated = { "@_id": req.params.id, ...requestItem };
    if (req.params.resource === "conciertos") {
      const { nombre, artista, lugar, fecha, hora, descripcion, imagen, boletos } = requestItem;
      Object.assign(updated, { nombre, artista, lugar, fecha, hora, descripcion, imagen, boletos: { boleto: asArray(boletos) } });
    }
    if (req.params.resource === "compras") {
      updated.fechaCompra = items[index].fechaCompra;
      updated.usuarioId = items[index].usuarioId || user.id;
      delete updated.nombreComprador;
      delete updated.correo;
      delete updated.telefono;
    }

    const validationError = validateItem(req.params.resource, updated, database);
    if (validationError) return res.status(400).json({ error: validationError });

    if (req.params.resource === "compras") {
      const oldPurchase = items[index];
      const oldConcert = collection(database, "conciertos").find((concert) => itemId(concert) === oldPurchase.conciertoId);
      const oldTicket = ticketsOf(oldConcert).find((ticket) => ticket.tipo === oldPurchase.tipoBoleto);
      oldTicket.disponibles = Number(oldTicket.disponibles) + Number(oldPurchase.cantidad);
      const newConcert = collection(database, "conciertos").find((concert) => itemId(concert) === updated.conciertoId);
      const newTicket = ticketsOf(newConcert).find((ticket) => ticket.tipo === updated.tipoBoleto);
      newTicket.disponibles = Number(newTicket.disponibles) - Number(updated.cantidad);
      saveCollection(database, "conciertos", collection(database, "conciertos"));
    }

    items[index] = updated;
    saveCollection(database, req.params.resource, items);
    await writeDatabase(database);
    res.json(req.params.resource === "compras"
      ? publicPurchase(database, updated)
      : publicItem(updated));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/:resource/:id", async (req, res, next) => {
  try {
    if (!resourceConfig[req.params.resource]) return res.status(404).json({ error: "Recurso no encontrado." });
    const user = req.params.resource === "conciertos" ? requireRole(req, res, "admin") : requireAuth(req, res);
    if (!user) return;
    const database = await readDatabase();
    const items = collection(database, req.params.resource);
    const item = items.find((value) => itemId(value) === req.params.id);
    if (!item) return res.status(404).json({ error: "Registro no encontrado." });
    if (req.params.resource === "compras" && !userOwnsPurchase(item, user)) {
      return res.status(403).json({ error: "Solo puedes cancelar tus propias compras." });
    }
    if (req.params.resource === "conciertos" && purchasesFor(database, req.params.id).length > 0) {
      return res.status(409).json({ error: "Este concierto tiene ventas y no se puede cancelar; solo modificar." });
    }
    const remaining = items.filter((item) => itemId(item) !== req.params.id);
    if (req.params.resource === "compras") {
      const concert = collection(database, "conciertos").find((value) => itemId(value) === item.conciertoId);
      const ticket = concert && ticketsOf(concert).find((value) => value.tipo === item.tipoBoleto);
      if (ticket) ticket.disponibles = Number(ticket.disponibles) + Number(item.cantidad);
      saveCollection(database, "conciertos", collection(database, "conciertos"));
    }
    saveCollection(database, req.params.resource, remaining);
    await writeDatabase(database);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "No fue posible procesar la solicitud." });
});

app.listen(port, () => {
  console.log(`Venta de boletos disponible en http://localhost:${port}`);
});
