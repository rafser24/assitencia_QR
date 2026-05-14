# AttendanceQR v2.0
### Sistema de Control de Asistencias para Prácticas Profesionales

---

## Stack
- **React 18** + Vite 5
- **Firebase** (Firestore con persistencia offline, Auth)
- **html5-qrcode** (cámara real)
- **date-fns** (manejo de fechas)
- **vite-plugin-pwa** (PWA instalable)

---

## Configuración inicial

### 1. Clonar e instalar
```bash
git clone <tu-repo>
cd attendance-qr
npm install
```

### 2. Variables de entorno
```bash
cp .env.example .env
# Edita .env con tus credenciales de Firebase
```

### 3. Configurar Firebase
En **Firebase Console** → Tu proyecto:

**Habilitar Firestore:**
- Ve a Firestore Database → Crear base de datos
- Modo producción (ajustar reglas después)

**Reglas de Firestore** (Firebase Console → Firestore → Reglas):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Cualquiera puede leer alumnos por QR
    match /alumnos/{uid} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    // Registros de asistencia
    match /asistencias/{id} {
      allow read, write: if true; // Ajustar en producción
    }
  }
}
```

**Índices de Firestore** (necesarios para las queries):
- Colección `asistencias`: campos `alumnoId ASC`, `fecha ASC`
- Colección `asistencias`: campos `alumnoId ASC`, `fecha DESC`

### 4. Desarrollo local
```bash
npm run dev
# → http://localhost:5173
```

---

## Deploy en Netlify

### Opción A: Drag & Drop (más fácil)
```bash
npm run build       # genera carpeta dist/
```
Sube la carpeta `dist/` directamente en netlify.com/drop

### Opción B: GitHub + Netlify (recomendado)
1. Sube el proyecto a GitHub
2. En Netlify: **Add new site → Import from Git**
3. Configurar:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. En **Site settings → Environment variables**, agrega todas las vars de `.env`

El archivo `netlify.toml` ya configura todo automáticamente.

---

## Estructura del proyecto
```
src/
├── hooks/
│   └── useAttendanceLogic.js   ← Toda la lógica de negocio (180min, calendario)
├── services/
│   └── firestoreService.js     ← CRUD con Firestore
├── components/
│   ├── QRScanner.jsx           ← Componente de cámara (html5-qrcode)
│   └── Toast.jsx               ← Notificaciones
├── pages/
│   ├── LectorPage.jsx          ← Vista pública (escaneo)
│   └── AdminPage.jsx           ← Panel protegido
├── firebase.js                 ← Inicialización Firebase + offline
├── App.jsx                     ← Router + navbar + auth
├── main.jsx
└── index.css
```

---

## Lógica de negocio

### Regla de los 180 minutos
- Si el alumno llega a las 13:05 → 5 min de retraso acumulados
- Cuando el acumulado llega a 180 min → `diasExtra += 1`, reinicia con el residuo
- Ejemplo: 175min + 10min nuevos = 185min → `diasExtra += 1`, quedan 5min

### Calendario semanal
| Día | Acción |
|-----|--------|
| Martes, Miércoles, Jueves | Días obligatorios de práctica |
| Viernes | Reposición (solo si faltó algún día obligatorio) |
| Viernes sin faltas | Mensaje: "Asistencias completas esta semana" |

### Check-in / Check-out automático
Al escanear el QR:
- Si NO hay registro abierto hoy → **Check-in** (registra entrada)
- Si HAY un registro abierto → **Check-out** (registra salida)

---

## Agregar alumnos a Firestore
Desde el Panel Admin → "Nuevo Alumno", o directamente en Firestore Console:

```json
// Colección: alumnos / Documento: {uid}
{
  "nombre": "García López, Sofía",
  "codigoQR": "QR-ALU001",
  "minutosAcumulados": 0,
  "diasExtra": 0,
  "historialFaltas": [],
  "creadoEn": "timestamp"
}
```

El campo `codigoQR` debe coincidir exactamente con lo que imprime el código QR físico.

---

## Generar QR físicos
Usa cualquier generador de QR (qr-code-generator.com) con el valor del campo `codigoQR`.
Ejemplo: genera un QR con el texto `QR-ALU001` e imprímelo para el alumno.

---

## PWA — Instalación en móvil
Al abrir la app en Chrome (Android) o Safari (iOS), aparecerá la opción
"Agregar a pantalla de inicio". Una vez instalada funciona como app nativa,
incluso con conexión intermitente gracias a Firestore offline.
