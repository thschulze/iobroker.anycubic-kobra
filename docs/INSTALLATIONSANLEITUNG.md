# Anycubic Kobra ioBroker Adapter - Installationsanleitung

## Inhaltsverzeichnis

1. [Voraussetzungen](#voraussetzungen)
2. [Installation des Adapters](#installation-des-adapters)
3. [Konfiguration](#konfiguration)
4. [Cloud-Token erhalten](#cloud-token-erhalten)
5. [LAN-Modus einrichten](#lan-modus-einrichten)
6. [Erste Schritte](#erste-schritte)
7. [VIS-Integration](#vis-integration)
8. [Automatisierungen](#automatisierungen)
9. [Fehlerbehebung](#fehlerbehebung)

---

## Voraussetzungen

### System
- ioBroker >= 5.0.0
- Node.js >= 18.x
- js-controller >= 5.0.0
- Admin Adapter >= 6.0.0

### Unterstützte Drucker
- **Kobra S1 / S1 Combo** - Vollständig unterstützt inkl. Kamera
- **Kobra 3 / 3 Combo** - Vollständig unterstützt inkl. Kamera
- **Kobra 2 / 2 Pro / 2 Max** - Unterstützt (ohne Kamera)

### Netzwerk
- WiFi: **Nur 2.4 GHz** (5 GHz wird von den Druckern nicht unterstützt)
- Drucker und ioBroker müssen im selben Netzwerk sein (für LAN-Modus)
- Port 8883 (MQTT) muss erreichbar sein (für Cloud-Modus)

---

## Installation des Adapters

### Methode 1: Über die ioBroker Admin-Oberfläche (Empfohlen)

1. Öffnen Sie die ioBroker Admin-Oberfläche in Ihrem Browser
2. Navigieren Sie zu **Adapter**
3. Klicken Sie auf das **GitHub-Icon** (Expertenansicht) oben links
4. Wählen Sie **Von eigener URL installieren**
5. Geben Sie den Pfad zum Adapter ein oder laden Sie die ZIP-Datei hoch
6. Klicken Sie auf **Installieren**

### Methode 2: Manuelle Installation

```bash
# Wechseln Sie ins ioBroker-Verzeichnis
cd /opt/iobroker

# Kopieren Sie den Adapter ins node_modules-Verzeichnis
cp -r /pfad/zu/iobroker.anycubic-kobra node_modules/

# Installieren Sie die Abhängigkeiten
cd node_modules/iobroker.anycubic-kobra
npm install --production

# Aktualisieren Sie den Adapter in ioBroker
cd /opt/iobroker
iobroker upload anycubic-kobra
```

### Methode 3: Über npm (wenn veröffentlicht)

```bash
cd /opt/iobroker
npm install iobroker.anycubic-kobra
iobroker add anycubic-kobra
```

---

## Konfiguration

Nach der Installation erscheint der Adapter in der Adapter-Liste. Klicken Sie auf das **+** Symbol um eine Instanz zu erstellen.

### Verbindungsmodus wählen

Sie haben zwei Optionen:

| Modus | Vorteile | Nachteile |
|-------|----------|-----------|
| **Cloud** | Echtzeit-Updates, Fernzugriff möglich | Benötigt Cloud-Token, Internet erforderlich |
| **LAN** | Keine Cloud nötig, schnellere Reaktion | Nur im lokalen Netzwerk, keine mobile App |

---

## Cloud-Token erhalten

### Schritt-für-Schritt Anleitung

1. **Anycubic Slicer Next herunterladen**
   - Besuchen Sie: https://www.anycubic.com/pages/anycubic-slicer
   - Laden Sie die **Windows-Version** herunter
   - Installieren Sie die Software

2. **Anmelden**
   - Starten Sie Anycubic Slicer Next
   - Klicken Sie auf das Profil-Icon oben rechts
   - Melden Sie sich mit Ihrem Anycubic-Konto an
   - Warten Sie, bis die Anmeldung erfolgreich ist

3. **Token-Datei finden**
   - Drücken Sie `Windows + R`
   - Geben Sie ein: `%AppData%\AnycubicSlicerNext`
   - Drücken Sie Enter
   - Öffnen Sie die Datei `AnycubicSlicerNext.conf` mit einem Texteditor

4. **Token kopieren**
   - Suchen Sie nach `"access_token"`
   - Kopieren Sie den Wert **ohne die Anführungszeichen**
   - Der Token ist 344 Zeichen lang

   Beispiel:
   ```json
   "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   ```

5. **Token im Adapter einfügen**
   - Öffnen Sie die Adapter-Konfiguration in ioBroker
   - Fügen Sie den Token in das Feld "Cloud Access Token" ein
   - Speichern Sie die Konfiguration

### Wichtige Hinweise zum Token

- Der Token läuft nach einiger Zeit ab und muss dann erneuert werden
- Nach dem Kopieren können Sie den Token im Slicer leeren (`"access_token": ""`) um doppelte Logins zu vermeiden
- Behandeln Sie den Token wie ein Passwort - teilen Sie ihn nicht!

---

## LAN-Modus einrichten

### Am Drucker

1. Gehen Sie zu **Einstellungen** auf dem Drucker-Display
2. Wählen Sie **Netzwerk**
3. Aktivieren Sie **LAN-Modus**
4. Ein LAN-Symbol erscheint oben rechts im Display
5. Notieren Sie die angezeigte **IP-Adresse**

### Im Adapter

1. Wählen Sie "Lokales Netzwerk (LAN)" als Verbindungsmodus
2. Klicken Sie auf "Drucker hinzufügen"
3. Geben Sie ein:
   - **Name**: Ein beliebiger Name (z.B. "Kobra S1 Werkstatt")
   - **Modell**: Wählen Sie Ihr Druckermodell
   - **IP-Adresse**: Die IP vom Drucker-Display
4. Klicken Sie auf das Such-Symbol um die Verbindung zu testen
5. Speichern Sie die Konfiguration

### Statische IP-Adresse empfohlen

Um Probleme zu vermeiden, sollten Sie dem Drucker eine statische IP in Ihrem Router zuweisen:

1. Öffnen Sie die Router-Konfiguration
2. Suchen Sie den Drucker in der Geräteliste (Name: ANYCUBIC-XXXX)
3. Weisen Sie eine statische IP zu

---

## Erste Schritte

Nach erfolgreicher Konfiguration erstellt der Adapter automatisch Objekte für jeden Drucker.

### Objekt-Struktur

```
anycubic-kobra.0
├── info
│   └── connection        # Verbindungsstatus
└── {drucker_id}
    ├── info
    │   ├── name          # Druckername
    │   ├── model         # Modell
    │   ├── status        # idle/printing/paused/error
    │   └── online        # Online-Status
    ├── temperature
    │   ├── nozzle        # Düsentemperatur
    │   ├── nozzleTarget  # Düsen-Sollwert
    │   ├── bed           # Betttemperatur
    │   └── bedTarget     # Bett-Sollwert
    ├── job
    │   ├── name          # Dateiname
    │   ├── progress      # Fortschritt in %
    │   ├── timeElapsed   # Verstrichene Zeit
    │   └── timeRemaining # Verbleibende Zeit
    ├── control
    │   ├── pause         # Druck pausieren
    │   ├── resume        # Druck fortsetzen
    │   ├── stop          # Druck abbrechen
    │   ├── light         # Beleuchtung an/aus
    │   └── fan           # Lüftergeschwindigkeit
    └── camera
        └── streamUrl     # Kamera-Stream URL
```

---

## VIS-Integration

### Kamera-Stream anzeigen

#### Mit Basic - iFrame Widget

1. Ziehen Sie ein **Basic - iFrame** Widget auf die VIS-Oberfläche
2. Setzen Sie als URL: `{anycubic-kobra.0.{drucker_id}.camera.streamUrl}`
3. Aktivieren Sie "URL aus Datenpunkt"

#### Mit HTML-Widget

```html
<video width="100%" autoplay muted playsinline>
    <source src="{anycubic-kobra.0.drucker_id.camera.streamUrl}" type="video/x-flv">
    Ihr Browser unterstützt kein Video.
</video>
```

### Fortschrittsbalken

Verwenden Sie ein **Basic - Progress Bar** Widget:
- Objekt-ID: `anycubic-kobra.0.{drucker_id}.job.progress`
- Min: 0
- Max: 100

### Steuerungsbuttons

Erstellen Sie Buttons für Pause/Resume/Stop:
- Widget: **Basic - Bool Value / HTML**
- Objekt-ID: `anycubic-kobra.0.{drucker_id}.control.pause`
- Modus: Button

---

## Automatisierungen

### Beispiel: Benachrichtigung bei Druckende (Telegram)

```javascript
on({id: 'anycubic-kobra.0.*.job.progress', change: 'ne'}, function(obj) {
    if (obj.state.val === 100) {
        const printerId = obj.id.split('.')[2];
        const printerName = getState(`anycubic-kobra.0.${printerId}.info.name`).val;

        sendTo('telegram.0', {
            text: `✅ 3D-Druck auf "${printerName}" abgeschlossen!`
        });
    }
});
```

### Beispiel: Licht bei Druckstart einschalten

```javascript
on({id: 'anycubic-kobra.0.*.info.status', change: 'ne'}, function(obj) {
    const printerId = obj.id.split('.')[2];

    if (obj.state.val === 'printing') {
        setState(`anycubic-kobra.0.${printerId}.control.light`, true);
    } else if (obj.state.val === 'idle') {
        setState(`anycubic-kobra.0.${printerId}.control.light`, false);
    }
});
```

### Beispiel: Warnung bei hoher Temperatur

```javascript
on({id: 'anycubic-kobra.0.*.temperature.nozzle'}, function(obj) {
    if (obj.state.val > 260) {
        log('⚠️ Warnung: Düsentemperatur über 260°C!', 'warn');
        sendTo('pushover.0', {
            title: '3D-Drucker Warnung',
            message: `Düsentemperatur: ${obj.state.val}°C`
        });
    }
});
```

---

## Fehlerbehebung

### Problem: "Verbindung fehlgeschlagen"

**Cloud-Modus:**
1. Überprüfen Sie die Token-Länge (muss 344 Zeichen sein)
2. Erneuern Sie den Token (erneut aus Slicer kopieren)
3. Prüfen Sie Ihre Internetverbindung
4. Stellen Sie sicher, dass Port 8883 nicht blockiert ist

**LAN-Modus:**
1. Pingen Sie die Drucker-IP: `ping 192.168.x.x`
2. Ist der LAN-Modus am Drucker aktiviert?
3. Sind Drucker und ioBroker im selben Subnetz?
4. Starten Sie den Drucker neu

### Problem: "Keine Drucker gefunden"

1. Melden Sie sich in der Anycubic App an und prüfen Sie, ob Drucker dort erscheinen
2. Wurde der Drucker mit Ihrem Anycubic-Konto verbunden?
3. Ist der Drucker eingeschaltet und mit WiFi verbunden?

### Problem: "MQTT-Verbindung instabil"

Anycubic blockiert teilweise Drittanbieter-MQTT-Verbindungen:
1. Versuchen Sie, den Token zu erneuern
2. Deaktivieren Sie MQTT und nutzen Sie nur Polling
3. Erhöhen Sie das Abfrageintervall auf 60 Sekunden

### Problem: "Kamera-Stream lädt nicht"

1. Nur Kobra S1 und neuere Modelle haben Kamera-Unterstützung
2. Prüfen Sie den Stream direkt: `http://DRUCKER_IP:18088/flv`
3. Der Stream ist nur im LAN-Modus lokal verfügbar
4. Nutzen Sie einen Browser, der FLV-Streams unterstützt (oder VLC)

### Log-Dateien prüfen

```bash
# ioBroker Logs anzeigen
cd /opt/iobroker
cat log/iobroker.current.log | grep anycubic-kobra
```

Oder in der Admin-Oberfläche unter **Logs**.

---

## Support

Bei Problemen:
1. Prüfen Sie zuerst diese Anleitung
2. Schauen Sie in die ioBroker Logs
3. Erstellen Sie ein Issue auf GitHub mit:
   - Druckermodell
   - ioBroker-Version
   - Adapter-Version
   - Fehlermeldung aus den Logs

---

**Viel Erfolg mit Ihrem Anycubic Kobra Adapter!** 🖨️
