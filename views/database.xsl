<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform">

  <xsl:output method="html" encoding="UTF-8" indent="yes"/>

  <xsl:template match="/">
    <html lang="es">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>Sonora | Catálogo de conciertos</title>
        <style>
          :root {
            --background: #0d0d15;
            --panel: #191826;
            --card: #242238;
            --border: #383451;
            --pink: #ff4f9a;
            --yellow: #ffd166;
            --cyan: #61dafb;
            --text: #fff9f1;
            --muted: #aaa6bd;
          }

          * { box-sizing: border-box; }

          body {
            max-width: 1160px;
            margin: 0 auto;
            padding: 42px 24px 70px;
            background:
              radial-gradient(circle at 80% 0, #49234c 0, var(--background) 44%);
            color: var(--text);
            font: 16px system-ui, sans-serif;
          }

          header {
            position: relative;
            min-height: 310px;
            margin-bottom: 34px;
            padding: 64px 34px 25px;
            border-bottom: 1px solid var(--border);
            border-radius: 16px;
            overflow: hidden;
            background: linear-gradient(90deg, #0d0d15f5 0%, #0d0d1599 58%, #0d0d1544 100%), url("/images/header.jfif") center / cover no-repeat;
          }

          .eyebrow {
            color: var(--yellow);
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 3px;
          }

          h1 {
            margin: 16px 0 8px;
            color: var(--pink);
            font-size: clamp(40px, 8vw, 76px);
            line-height: .92;
          }

          h2 {
            margin-top: 38px;
            color: var(--yellow);
          }

          h3 { margin: 8px 0 14px; }
          p { line-height: 1.5; }
          .muted { color: var(--muted); }

          .catalog-link {
            display: inline-grid;
            place-items: center;
            width: 44px;
            height: 44px;
            margin-top: 16px;
            border: 1px solid var(--border);
            border-radius: 50%;
            background: var(--panel);
            color: var(--text);
            font-weight: 800;
            font-size: 25px;
            line-height: 1;
            text-decoration: none;
          }

          .catalog-link:hover { background: var(--card); }

          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(430px, 1fr));
            gap: 22px;
          }

          article {
            position: relative;
            padding: 20px;
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 16px;
            box-shadow: 0 16px 35px #0004;
          }

          .concert-image {
            width: calc(100% + 40px);
            height: 170px;
            margin: -20px -20px 16px;
            border-radius: 16px 16px 0 0;
            object-fit: cover;
          }

          article.concert { display: grid; grid-template-columns: minmax(190px, 38%) minmax(0, 1fr); gap: 20px; padding: 0; border-left: 4px solid var(--pink); overflow: hidden; }
          article.purchase { border-left: 4px solid var(--cyan); }
          article.concert:before { content: "LIVE"; position: absolute; top: 14px; left: 14px; z-index: 2; color: var(--pink); font-size: 11px; font-weight: 800; letter-spacing: 2px; text-shadow: 0 1px 4px #000; }
          .concert-image { width: 100%; height: 100%; min-height: 300px; max-height: 410px; margin: 0; border-radius: 12px 0 0 12px; object-fit: cover; }
          .concert-placeholder { display: grid; place-items: center; min-height: 300px; background: linear-gradient(145deg, #3c2050, #111725); color: var(--pink); font-size: 28px; font-weight: 900; letter-spacing: 4px; }
          .concert-content { min-width: 0; }
          article.concert > .concert-content { padding: 30px 20px 20px 0; }
          article.concert .ticket { padding: 11px 0; border-top: 1px solid var(--border); }
          @media (max-width: 900px) {
            .grid { grid-template-columns: 1fr; }
          }
          @media (max-width: 650px) {
            article.concert { display: block; }
            .concert-image { height: 230px; min-height: 0; max-height: none; border-radius: 12px 12px 0 0; margin-bottom: 0; }
            article.concert > .concert-content { padding: 28px 20px 20px; }
          }
          strong { color: var(--cyan); }
          .ticket {
            padding: 10px 0;
            border-top: 1px solid var(--border);
          }

          .count {
            display: inline-block;
            padding: 7px 11px;
            background: var(--panel);
            border-radius: 8px;
            color: var(--yellow);
          }
        </style>
      </head>
      <body>
        <header>
          <div class="eyebrow">SONORA · XML + XSLT</div>
          <h1>Catálogo de conciertos</h1>
          <p class="muted">Vista generada con XSLT a partir del almacenamiento XML.</p>
          <a class="catalog-link" href="/" title="Regresar a la página principal" aria-label="Regresar a la página principal">&#8592;</a>
        </header>

        <main>
          <h2>Eventos actuales</h2>
          <div class="grid">
            <xsl:for-each select="eventos/conciertos/concierto[not(proximamente = 'true')]">
              <article class="concert">
                <xsl:choose>
                  <xsl:when test="imagen"><img class="concert-image" src="{imagen}" alt="Imagen de {nombre}"/></xsl:when>
                  <xsl:otherwise><div class="concert-placeholder">SONORA</div></xsl:otherwise>
                </xsl:choose>
                <div class="concert-content">
                  <h3><xsl:value-of select="nombre"/></h3>
                  <p><strong><xsl:value-of select="artista"/></strong></p>
                  <p>
                    Lugar: <xsl:value-of select="lugar"/><br/>
                    Fecha y hora: <xsl:value-of select="fecha"/> · <xsl:value-of select="hora"/>
                  </p>
                  <xsl:for-each select="boletos/boleto">
                    <div class="ticket">
                      <strong><xsl:value-of select="tipo"/></strong>
                      · $<xsl:value-of select="precio"/>
                      · <xsl:value-of select="disponibles"/> disponibles
                    </div>
                  </xsl:for-each>
                </div>
              </article>
            </xsl:for-each>
            <xsl:if test="not(eventos/conciertos/concierto[not(proximamente = 'true')])">
              <p class="muted">Aún no hay eventos actuales.</p>
            </xsl:if>
          </div>

          <h2>Próximamente</h2>
          <div class="grid">
            <xsl:for-each select="eventos/conciertos/concierto[proximamente = 'true']">
              <article class="concert">
                <xsl:choose>
                  <xsl:when test="imagen"><img class="concert-image" src="{imagen}" alt="Imagen de {nombre}"/></xsl:when>
                  <xsl:otherwise><div class="concert-placeholder">SONORA</div></xsl:otherwise>
                </xsl:choose>
                <div class="concert-content">
                  <h3><xsl:value-of select="nombre"/></h3>
                  <p><strong><xsl:value-of select="artista"/></strong></p>
                  <p>Fecha: <xsl:value-of select="fecha"/></p>
                </div>
              </article>
            </xsl:for-each>
            <xsl:if test="not(eventos/conciertos/concierto[proximamente = 'true'])">
              <p class="muted">Aún no hay eventos próximos.</p>
            </xsl:if>
          </div>

          <h2>Compras registradas</h2>
          <p class="count">
            <xsl:value-of select="count(eventos/compras/compra)"/> compra(s)
          </p>
          <div class="grid">
            <xsl:for-each select="eventos/compras/compra">
              <article class="purchase">
                <h3><xsl:value-of select="nombreComprador"/></h3>
                <p>
                  <strong>Zona:</strong> <xsl:value-of select="tipoBoleto"/>
                  · <xsl:value-of select="cantidad"/> boleto(s)
                </p>
                <p>
                  <strong>Correo:</strong> <xsl:value-of select="correo"/><br/>
                  <strong>Teléfono:</strong> <xsl:value-of select="telefono"/>
                </p>
              </article>
            </xsl:for-each>
            <xsl:if test="not(eventos/compras/compra)">
              <p class="muted">Todavía no hay compras registradas.</p>
            </xsl:if>
          </div>
        </main>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
