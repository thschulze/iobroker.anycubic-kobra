/*global systemDictionary:true */
'use strict';

systemDictionary = {
    "description": {
        "en": "Control and monitor your Anycubic Kobra 3D printers via ioBroker",
        "de": "Steuern und überwachen Sie Ihre Anycubic Kobra 3D-Drucker über ioBroker"
    },
    "connectionMode": {
        "en": "Connection Mode",
        "de": "Verbindungsmodus"
    },
    "cloudMode": {
        "en": "Anycubic Cloud",
        "de": "Anycubic Cloud"
    },
    "cloudModeDesc": {
        "en": "Connect via Anycubic Cloud servers. Requires cloud token.",
        "de": "Verbindung über Anycubic Cloud Server. Benötigt Cloud-Token."
    },
    "localMode": {
        "en": "Local Network (LAN)",
        "de": "Lokales Netzwerk (LAN)"
    },
    "localModeDesc": {
        "en": "Direct connection in local network. No cloud required.",
        "de": "Direkte Verbindung im lokalen Netzwerk. Keine Cloud erforderlich."
    },
    "cloudConfig": {
        "en": "Cloud Configuration",
        "de": "Cloud-Konfiguration"
    },
    "howToGetToken": {
        "en": "How to get the Cloud Token:",
        "de": "So erhalten Sie den Cloud-Token:"
    },
    "tokenStep1": {
        "en": "Install Anycubic Slicer Next (Windows)",
        "de": "Installieren Sie Anycubic Slicer Next (Windows)"
    },
    "tokenStep2": {
        "en": "Sign in with your Anycubic account",
        "de": "Melden Sie sich mit Ihrem Anycubic-Konto an"
    },
    "tokenStep3": {
        "en": "Open file: %AppData%\\\\AnycubicSlicerNext\\\\AnycubicSlicerNext.conf",
        "de": "Öffnen Sie die Datei: %AppData%\\\\AnycubicSlicerNext\\\\AnycubicSlicerNext.conf"
    },
    "tokenStep4": {
        "en": "Copy the value of \"access_token\" (344 characters)",
        "de": "Kopieren Sie den Wert von \"access_token\" (344 Zeichen)"
    },
    "cloudTokenLabel": {
        "en": "Cloud Access Token",
        "de": "Cloud Access Token"
    },
    "cloudTokenHelp": {
        "en": "The 344-character token from Anycubic Slicer Next",
        "de": "Der 344-Zeichen Token aus Anycubic Slicer Next"
    },
    "mqttDisabled": {
        "en": "MQTT disabled",
        "de": "MQTT deaktiviert"
    },
    "mqttEnabled": {
        "en": "MQTT enabled (real-time updates)",
        "de": "MQTT aktiviert (Echtzeit-Updates)"
    },
    "localPrinters": {
        "en": "Local Printers",
        "de": "Lokale Drucker"
    },
    "localPrintersDesc": {
        "en": "Enable LAN mode on your printer: Settings > Network > LAN Mode",
        "de": "Aktivieren Sie den LAN-Modus auf Ihrem Drucker unter: Einstellungen > Netzwerk > LAN-Modus"
    },
    "addPrinter": {
        "en": "Add Printer",
        "de": "Drucker hinzufügen"
    },
    "printerName": {
        "en": "Name",
        "de": "Name"
    },
    "printerModel": {
        "en": "Model",
        "de": "Modell"
    },
    "printerIP": {
        "en": "IP Address",
        "de": "IP-Adresse"
    },
    "pollingConfig": {
        "en": "Polling Settings",
        "de": "Abfrage-Einstellungen"
    },
    "pollIntervalLabel": {
        "en": "Poll Interval (seconds)",
        "de": "Abfrageintervall (Sekunden)"
    },
    "pollIntervalHelp": {
        "en": "How often the printer status is queried (5-300 seconds)",
        "de": "Wie oft der Druckerstatus abgefragt wird (5-300 Sekunden)"
    },
    "testConnection": {
        "en": "Test Connection",
        "de": "Verbindung testen"
    },
    "testBtn": {
        "en": "Test Connection",
        "de": "Verbindung testen"
    }
};
