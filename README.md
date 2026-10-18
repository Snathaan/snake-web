# Snake 3D Multijugador (Web)

Juego del clasico Snake en **3D** para jugar en linea con **2 jugadores** mediante un **codigo de sala**. El servidor de salas usa WebSocket (Node.js) y el cliente 3D usa Three.js (WebGL).

## Caracteristicas

- 2 jugadores en tiempo real por WebSocket.
- Salas identificadas con un codigo de 4 caracteres.
- Servidor autoritativo: el host simula y difunde el estado; el cliente solo envia entradas.
- Graficos 3D con Three.js y camara orbital.
- Enlace directo a una sala: `?room=CODIGO`.
- Revancha al terminar la partida.

## Requisitos

- Node.js 18 o superior.

## Ejecutar en local

```bash
npm install
npm start
```

Abre <http://localhost:3000>

1. Pestana A: **Crear sala** (obtienes un codigo, p. ej. `SHT7`).
2. Pestana B (u otro equipo de la red): escribe el codigo y pulsa **Unirse**.
3. Enlace directo: <http://localhost:3000/?room=SHT7>

## Controles

- Muevete con **WASD** o las **flechas** (controlas tu propia serpiente).
- **Raton**: orbitar y hacer zoom en la camara.

## Reglas

- Chocar con el muro, contigo mismo o con el rival te elimina.
- Gana quien sobrevive; hay empate si chocan de frente.
- Comer la esfera naranja crece y suma un punto; la velocidad aumenta con los puntos.

## Estructura

```
snake-web/
|-- server.js          # Servidor Node + WebSocket (salas por codigo)
|-- package.json
|-- vercel.json        # Config para desplegar el frontend en Vercel
`-- public/
    |-- index.html     # Lobby
    |-- style.css
    |-- config.js      # URL del servidor WebSocket
    `-- game.js        # Cliente 3D (Three.js) + red
```

## Despliegue

Recomendado: **frontend en Vercel** + **servidor WebSocket en Render/Railway/Fly.io**.

### 1. Servidor WebSocket (Render)

1. Sube este repo a GitHub.
2. Render -> New -> Web Service -> conecta el repo.
3. Build: `npm install` - Start: `npm start`.
4. Obtienes `https://tu-servidor.onrender.com` (que en el navegador es `wss://...`).

### 2. Frontend (Vercel)

1. Vercel -> Add New -> Project -> importa el repo.
2. Framework Preset: **Other**. `vercel.json` ya sirve la carpeta `public/`.
3. Edita `public/config.js`:

   ```js
   window.SNAKE_WS = "wss://tu-servidor.onrender.com";
   ```

4. Redeploy. Alternativa sin redeploy:
   `https://tu-app.vercel.app/?server=wss://tu-servidor.onrender.com`

### Nota sobre Vercel y WebSocket

Vercel soporta WebSocket (beta), pero cada conexion nueva puede caer en otra instancia y la conexion se cierra a los ~300 s en el plan Hobby. Por eso el servidor de salas se aloja aparte: el estado de las salas vive en la memoria de una unica instancia.

## Tecnologias

- Node.js + `ws` (WebSocket)
- Three.js (render 3D en el navegador)
