# Muyu Fake API

API REST simulada para la aplicación móvil Android de Muyu. Está construida con Node.js sin dependencias externas y preparada para desplegarse en Render.

## Ejecutar localmente

```powershell
cd fake-api
npm start
```

La API queda disponible en `http://localhost:3000/api/` y el healthcheck en `http://localhost:3000/health`.

## Credenciales de demostración

| Rol | Correo | Contraseña |
|---|---|---|
| Agricultor | `maria.quispe@muyu.pe` | `Muyu1234` |
| Comerciante | `jose.arturo@muyu.pe` | `Muyu1234` |
| Agricultor | `carlos.mamani@muyu.pe` | `Muyu1234` |

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | Verifica el estado del servicio |
| `POST` | `/api/users/login` | Inicia sesión |
| `POST` | `/api/users/register` | Registra un agricultor |
| `GET` | `/api/plots` | Lista las parcelas |
| `POST` | `/api/plots` | Crea una parcela |
| `PUT` | `/api/plots/:id` | Actualiza una parcela |
| `POST` | `/api/plots/:id/fund` | Financia una parcela |

El token devuelto por login puede enviarse como `Authorization: Bearer <token>`. Para conservar compatibilidad con el interceptor local actual, los endpoints de parcelas también funcionan con los usuarios de demostración cuando aún no se envía el token.

## Desplegar en Render

1. Subir esta carpeta a un repositorio de GitHub.
2. En Render, seleccionar **New > Blueprint** y conectar el repositorio que contiene `render.yaml`.
3. Como alternativa, crear un **Web Service** con los siguientes valores:
   - Runtime: `Node`
   - Build command: `npm install`
   - Start command: `npm start`
   - Health check path: `/health`
4. Esperar a que Render entregue una URL similar a `https://muyu-fake-api.onrender.com`.

La URL base que posteriormente utilizará Retrofit será:

```text
https://muyu-fake-api.onrender.com/api/
```

> El plan gratuito de Render utiliza un sistema de archivos efímero. Los registros y parcelas creados durante la ejecución pueden reiniciarse después de un nuevo despliegue o reinicio. Esto es apropiado para una Fake API de demostración.
