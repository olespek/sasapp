# Sola Airshow – arenaplan

Et verktøy for å planlegge og styre arenaen til Sola Airshow. Arenaen tegnes på et kart over flyplassen, og hvert objekt følges opp med status, ansvarlig, leverandør og frist.

## Funksjoner

- **Kart** med flyfoto (Esri), Kartverkets topografiske kart og gråtonekart, og OpenStreetMap. Kartet åpner over hovedområdet, og ⌂-knappen går tilbake dit.
- **Objekter** som punkt, linje eller område: publikumsområder, gjerder, toaletter, innganger og utganger, nødutganger, rømningsveier, strøm, stander og expo, parkering og mer. Katalogen ligger i `shared/catalog.ts`.
- **Fly på static display** som forenklede siluetter i riktig målestokk. De flyttes med ✥-håndtaket og roteres med ⟳-håndtaket. For helikoptre vises også rotordisken. Flytypene ligger i `shared/aircraft.ts`.
- **Styring:** status (idé → ferdig, eller avvik), ansvarlig, leverandør, antall, frist og notat. Objektlisten kan filtreres og søkes i, og oversikten summerer antall, meter og m² per type og viser hva som er over frist.
- **Tilgang:** rollene *leser*, *redaktør* og *administrator*. En administrator kan **låse planen**, og da kan bare administratorer redigere den.
- **Delingslenke** (`/vis/<nøkkel>`) som gir lesetilgang uten innlogging. Den kan slås av, og man kan lage en ny lenke.
- **Sanntid:** endringer vises med en gang hos alle som har planen oppe.
- **Logg og versjoner:** hvem som endret hva og når. Navngitte øyeblikksbilder kan vises i kartet og gjenopprettes.
- Fungerer på mobil og nettbrett, og kan vise din egen GPS-posisjon (◎).

## Kom i gang

Krever Node.js 22.13 eller nyere. Databasen er SQLite via den innebygde `node:sqlite`.

```bash
npm install
npm run dev        # server på :3001 og Vite på :5173
```

Ved første oppstart opprettes brukeren `admin`, og et tilfeldig passord skrives i terminalen. Passordet kan også settes med `ADMIN_PASSWORD`. Logg inn, bytt passord, og legg til brukere under **Admin**.

**Startvisning:** Flytt og zoom kartet til utsnittet du vil at alle skal se først, og trykk på *Admin → Bruk dagens kartutsnitt som startvisning*.

## Produksjon

```bash
npm run build
npm start          # serverer både API og klient på PORT (standard 3001)
```

Eller med Docker:

```bash
docker build -t sasapp .
docker run -p 3001:3001 -v sasapp-data:/app/data -e ADMIN_PASSWORD=... sasapp
```

Miljøvariabler:

| Variabel | Standard | Beskrivelse |
|---|---|---|
| `PORT` | `3001` | Porten serveren lytter på |
| `DATABASE_PATH` | `data/sasapp.db` | Hvor databasen lagres. Ta sikkerhetskopi av denne fila. |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / tilfeldig | Brukes bare når databasen er tom |

Kjør appen bak HTTPS, for eksempel via en reverse proxy eller en vertstjeneste med TLS. Innloggingscookien blir da `Secure` automatisk.

## Utvikling

```bash
npm test           # API- og geometritester (vitest)
npm run typecheck
```

Struktur:

- `shared/`: typer, objektkatalog, flykatalog og geometri. Brukes av både server og klient.
- `server/`: Express-API, SQLite, innlogging og sanntid (Server-Sent Events).
- `src/`: React-klient. Kartet bruker Leaflet og Geoman (`src/map/`).
