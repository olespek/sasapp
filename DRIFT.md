# Sette arenaplanen i drift

Anbefalt oppsett: **Fly.io** med datasenter i Stockholm (`arn`) og et volum for databasen. Det koster omtrent 3–5 USD i måneden, og Fly krever betalingskort på kontoen. Appen stopper når ingen bruker den, og starter av seg selv på et par sekunder når noen åpner den.

All konfigurasjon ligger i `fly.toml` og `Dockerfile`.

## 1. Engangsoppsett

1. Lag en konto på <https://fly.io> og legg inn betalingskort.
2. Installer kommandolinjeverktøyet `flyctl`:
   - macOS: `brew install flyctl`
   - Windows (PowerShell): `iwr https://fly.io/install.ps1 -useb | iex`
   - Linux: `curl -L https://fly.io/install.sh | sh`
3. Logg inn: `fly auth login`

## 2. Opprett appen

Stå i prosjektmappen (på branchen med koden):

```bash
# Navnet blir en del av adressen: https://<navn>.fly.dev
# Velg et ledig navn og sett det samme i fly.toml (linjen «app = …»).
fly apps create sola-airshow-arenaplan

# Volum for databasen (1 GB er mer enn nok)
fly volumes create sasapp_data --region arn --size 1

# Passord for den første administratoren (velg et sterkt passord)
fly secrets set ADMIN_PASSWORD='et-langt-og-sterkt-passord'
```

## 3. Publiser

```bash
fly deploy
```

Når kommandoen er ferdig, ligger appen på `https://sola-airshow-arenaplan.fly.dev` (eller navnet du valgte).

1. Logg inn med brukernavn `admin` og passordet fra steg 2.
2. **Bytt passord** (menyen øverst til høyre).
3. Flytt kartet til hovedområdet, og trykk **Admin → Bruk dagens kartutsnitt som startvisning**.
4. Legg inn brukerne under **Admin → Brukere**.

`ADMIN_PASSWORD` brukes bare første gang, når databasen er tom. Du kan fjerne den etterpå med `fly secrets unset ADMIN_PASSWORD`.

## 4. Oppdateringer

Appen publiseres automatisk med GitHub Actions (`.github/workflows/fly-deploy.yml`) ved hver push. Før publisering kjøres tester og typesjekk, og feiler de, publiseres ingenting. Databasen ligger på volumet og blir ikke berørt.

Engangsoppsett:

1. Lag en publiseringsnøkkel (kjøres i prosjektmappen): `fly tokens create deploy -x 999999h`
2. Kopier hele nøkkelen. Den begynner med `FlyV1`.
3. På GitHub går du til repoet → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Gi den navnet `FLY_API_TOKEN` og lim inn nøkkelen.

Du kan også publisere manuelt med `fly deploy` fra prosjektmappen.

## 5. Egen adresse (valgfritt)

For eksempel `plan.solaairshow.no`:

```bash
fly certs add plan.solaairshow.no
```

Fly viser hvilken DNS-oppføring (CNAME eller A/AAAA) som må legges inn hos den som har domenet. HTTPS-sertifikatet ordnes automatisk.

## 6. Sikkerhetskopi

- Fly tar automatisk daglige øyeblikksbilder av volumet og beholder dem i 5 dager. Du ser dem med `fly volumes snapshots list <volum-id>` (volum-id-en får du fra `fly volumes list`).
- Ekstra kopi til egen maskin, for eksempel før showet:

  ```bash
  fly ssh console
  # inne i maskinen:
  rm -f /data/kopi.db
  node -e "new (require('node:sqlite').DatabaseSync)('/data/sasapp.db').exec(\"VACUUM INTO '/data/kopi.db'\")"
  exit
  # tilbake på din maskin:
  fly ssh sftp get /data/kopi.db sasapp-kopi.db
  ```

- Versjoner inne i appen (fanen **Versjoner**) er et supplement, men ikke en sikkerhetskopi, fordi de ligger i samme database.

## Nyttige kommandoer

| Kommando | Hva den gjør |
|---|---|
| `fly status` | Viser om appen kjører |
| `fly logs` | Viser loggen fra serveren |
| `fly ssh console` | Gir et skall inne i maskinen |
| `fly scale count 1` | Sørger for at det kjører én maskin. **Kjør aldri flere**, fordi SQLite-databasen ligger på ett volum. |

## Andre alternativer

Appen er en vanlig Docker-container og kan kjøres hvor som helst med varig disk, for eksempel på en VPS eller i Railway eller Render (betalt plan med disk). Krav:

- Monter en varig mappe og pek `DATABASE_PATH` dit, for eksempel `/data/sasapp.db`.
- Sett `ADMIN_PASSWORD` ved første oppstart.
- Kjør bak HTTPS.
- Kjør bare én instans.

```bash
docker build -t sasapp .
docker run -d -p 3001:3001 -v sasapp-data:/data -e DATABASE_PATH=/data/sasapp.db -e ADMIN_PASSWORD='...' sasapp
```
