'use strict';

const utils = require('@iobroker/adapter-core');
const axios = require('axios');

class AnycubicKobra extends utils.Adapter {
    constructor(options) {
        super({
            ...options,
            name: 'anycubic-kobra',
        });

        this.printers = new Map();
        this.pollTimer = null;
        
        // Die bekannten Anycubic Cloud Base-URLs
        this.API_SERVERS = [
            'https://cloud-universe.anycubic.com',
            'https://api.makeronline.com',
            'https://uc.makeronline.com'
        ];

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        this.log.info('Starte Anycubic Kobra Adapter...');

        if (!this.config.cloudToken || this.config.cloudToken.length < 50) {
            this.log.error('Cloud Token fehlt! Bitte Token aus der AnycubicSlicerNext.conf eintragen.');
            await this.setStateAsync('info.connection', false, true);
            return;
        }

        // Token säubern (falls der User versehentlich Anführungszeichen mitkopiert hat)
        this.config.cloudToken = this.config.cloudToken.replace(/['"]+/g, '');
        this.log.info(`Token geladen (${this.config.cloudToken.length} Zeichen).`);

        if (this.config.connectionMode === 'local') {
            await this.initLocalPrinters();
        } else {
            await this.initCloudConnection();
        }

        if (this.config.pollInterval > 0) {
            this.startPolling();
        }

        this.subscribeStates('*.control.*');
    }

    // --- ZENTRALE HEADER-FUNKTION (Basierend auf WaresWichall & balassy) ---
    getApiHeaders() {
        return {
            'XX-Token': this.config.cloudToken,
            'Authorization': `Bearer ${this.config.cloudToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            // Wichtig: App faken, damit Anycubic die Requests akzeptiert
            'User-Agent': 'AnycubicSlicerNext/1.3.9' 
        };
    }

    async initCloudConnection() {
        this.log.info('Verbinde mit Anycubic Cloud...');

        try {
            const printers = await this.fetchPrintersFromCloud();

            if (printers && printers.length > 0) {
                this.log.info(`Gefunden: ${printers.length} Drucker`);
                
                for (const printer of printers) {
                    this.log.info(`Drucker registriert: ${printer.name} (${printer.model})`);
                    await this.createPrinterObjects(printer);
                    this.printers.set(printer.id, printer);
                }

                await this.setStateAsync('info.connection', true, true);
            } else {
                this.log.warn('Keine Drucker in der Cloud gefunden.');
            }
        } catch (error) {
            this.log.error('Cloud-Initialisierungs-Fehler: ' + error.message);
        }
    }

    async fetchPrintersFromCloud() {
        const endpoints = ['/api/v1/device/list', '/api/v1/user/device/list'];

        for (const server of this.API_SERVERS) {
            for (const endpoint of endpoints) {
                try {
                    const url = `${server}${endpoint}`;
                    this.log.debug(`Suche Drucker unter: ${url}`);
                    
                    const response = await axios.get(url, { 
                        headers: this.getApiHeaders(), 
                        timeout: 10000 
                    });

                    // Anycubic versteckt die Daten oft in data.data oder data.result
                    const data = response.data.data || response.data.result || response.data;
                    
                    if (Array.isArray(data) && data.length > 0) {
                        this.log.info(`API Endpunkt erfolgreich: ${url}`);
                        this.activeServer = server; // Treffer speichern für Polling!
                        
                        return data.map(p => ({
                            id: String(p.device_id || p.sn || p.id),
                            name: p.device_name || p.name || 'Anycubic Drucker',
                            model: p.device_model || p.model || 'Kobra Serie',
                            status: p.status || p.state || 'unknown',
                            online: p.online || p.is_online || false,
                            local: false
                        }));
                    }
                } catch (err) {
                    this.log.debug(`${server}${endpoint} schlug fehl: ${err.message}`);
                }
            }
        }
        return [];
    }

    startPolling() {
        const ms = (this.config.pollInterval || 15) * 1000; // 15 Sek ist ein guter Standard für 3D-Drucker
        this.pollPrinters();
        this.pollTimer = setInterval(() => this.pollPrinters(), ms);
        this.log.info(`Cloud-Polling gestartet (Intervall: ${ms/1000}s)`);
    }

    async pollPrinters() {
        if (!this.activeServer) return;

        for (const [id, printer] of this.printers) {
            if (printer.local) continue;

            try {
                const url = `${this.activeServer}/api/v1/device/status?device_id=${printer.id}`;
                
                const response = await axios.get(url, {
                    headers: this.getApiHeaders(),
                    timeout: 5000
                });

                const data = response.data.data || response.data.result || response.data;
                
                if (data) {
                    // Logging der Raw-Daten auf Debug-Level, damit du später exakt siehst, was Anycubic liefert
                    this.log.debug(`Status Payload für ${id}: ${JSON.stringify(data)}`);
                    
                    // --- Mapping der Variablen (Mit Fallbacks für Kobra 2 vs. Kobra 3) ---
                    const nozzle = data.print_temp || data.temp_nozzle || data.nozzle_temp;
                    const bed = data.bed_temp || data.temp_bed;
                    const progress = data.print_progress || data.progress;
                    const status = data.print_status || data.status || data.state;
                    const timeRemain = data.remain_time || data.time_remain || data.left_time;

                    // Werte in ioBroker updaten (nur wenn sie in der API existieren)
                    if (nozzle !== undefined) await this.setStateAsync(`${id}.temperature.nozzle`, Number(nozzle), true);
                    if (bed !== undefined) await this.setStateAsync(`${id}.temperature.bed`, Number(bed), true);
                    if (progress !== undefined) await this.setStateAsync(`${id}.job.progress`, Number(progress), true);
                    if (status !== undefined) await this.setStateAsync(`${id}.info.status`, String(status), true);
                    if (timeRemain !== undefined) await this.setStateAsync(`${id}.job.timeRemaining`, Number(timeRemain), true);
                }
            } catch (error) {
                this.log.debug(`Polling-Fehler für ${id}: ${error.message}`);
            }
        }
    }

    async onStateChange(id, state) {
        if (!state || state.ack) return;

        const parts = id.split('.');
        if (parts.length < 5 || parts[3] !== 'control') return;

        const printerId = parts[2];
        const command = parts[4]; 

        this.log.info(`Sende '${command}' an Drucker ${printerId}...`);

        try {
            // Anycubic nutzt oft POST-Requests für Commands. 
            // ACHTUNG: Die Integer-Werte (1, 2, 3) für Commands variieren in der API. 
            // Hier ein übliches Pattern (Pause = 1, Resume = 2, Stop = 3).
            let cmdInt = 0;
            if (command === 'pause') cmdInt = 1;
            if (command === 'resume') cmdInt = 2;
            if (command === 'stop') cmdInt = 3;

            const url = `${this.activeServer}/api/v1/device/command`;
            const payload = {
                device_id: printerId,
                cmd: cmdInt,
                // Wenn es ein Switch ist (z.B. Licht), sende 1 für True, 0 für False
                val: typeof state.val === 'boolean' ? (state.val ? 1 : 0) : state.val 
            };

            await axios.post(url, payload, {
                headers: this.getApiHeaders(),
                timeout: 5000
            });

            this.log.info(`Befehl erfolgreich!`);
            await this.setStateAsync(id, state.val, true);

        } catch (error) {
            this.log.error(`Konnte '${command}' nicht senden: ${error.message}`);
        }
    }

    // Platzhalter für deine bestehenden Funktionen (der Übersichtlichkeit halber weggelassen)
    async initLocalPrinters() { /* Dein bestehender lokaler Code */ }
    async createPrinterObjects(printer) { /* Dein bestehender Setup-Code */ }

    onUnload(callback) {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        callback();
    }
}

if (require.main !== module) {
    module.exports = (options) => new AnycubicKobra(options);
} else {
    new AnycubicKobra();
}
