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
        this.API_BASE = 'https://cloud-universe.anycubic.com';

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        this.log.info('Starting Anycubic Kobra adapter...');

        // Validate token
        if (!this.config.cloudToken || this.config.cloudToken.length < 50) {
            this.log.error('Cloud Token fehlt oder ist zu kurz! Bitte in den Einstellungen konfigurieren.');
            await this.setStateAsync('info.connection', false, true);
            return;
        }

        this.log.info('Token vorhanden (' + this.config.cloudToken.length + ' Zeichen)');

        if (this.config.connectionMode === 'local') {
            await this.initLocalPrinters();
        } else {
            await this.initCloudConnection();
        }

        // Start polling
        if (this.config.pollInterval > 0) {
            this.startPolling();
        }

        this.subscribeStates('*.control.*');
    }

    async initCloudConnection() {
        this.log.info('Verbinde mit Anycubic Cloud...');

        try {
            const printers = await this.fetchPrintersFromCloud();

            if (printers && printers.length > 0) {
                this.log.info('Gefunden: ' + printers.length + ' Drucker');
                
                for (const printer of printers) {
                    this.log.info('Drucker: ' + printer.name + ' (ID: ' + printer.id + ')');
                    await this.createPrinterObjects(printer);
                    this.printers.set(printer.id, printer);
                }

                await this.setStateAsync('info.connection', true, true);
            } else {
                this.log.warn('Keine Drucker in der Cloud gefunden. Erstelle Demo-Drucker für Tests...');
                await this.createDemoPrinter();
            }
        } catch (error) {
            this.log.error('Cloud-Verbindung fehlgeschlagen: ' + error.message);
            this.log.info('Erstelle Demo-Drucker für Tests...');
            await this.createDemoPrinter();
        }
    }

    async fetchPrintersFromCloud() {
        const token = this.config.cloudToken;

        // Try different API endpoints
        const endpoints = [
            '/api/v1/user/printers',
            '/api/v1/printers',
            '/api/printer/list',
            '/v1/printers'
        ];

        for (const endpoint of endpoints) {
            try {
                this.log.debug('Versuche API: ' + this.API_BASE + endpoint);
                
                const response = await axios.get(this.API_BASE + endpoint, {
                    headers: {
                        'Authorization': 'Bearer ' + token,
                        'XX-Token': token,
                        'Content-Type': 'application/json',
                        'User-Agent': 'AnycubicSlicer/1.0'
                    },
                    timeout: 15000
                });

                this.log.debug('API Response Status: ' + response.status);
                this.log.debug('API Response: ' + JSON.stringify(response.data).substring(0, 500));

                if (response.data) {
                    const data = response.data.data || response.data.printers || response.data;
                    if (Array.isArray(data) && data.length > 0) {
                        return data.map(p => ({
                            id: String(p.id || p.printer_id || p.device_id),
                            name: p.name || p.printer_name || p.device_name || 'Anycubic Printer',
                            model: p.model || p.printer_model || 'Kobra',
                            status: p.status || 'unknown',
                            online: p.online || p.is_online || false
                        }));
                    }
                }
            } catch (err) {
                this.log.debug('Endpoint ' + endpoint + ' fehlgeschlagen: ' + err.message);
            }
        }

        return [];
    }

    async createDemoPrinter() {
        // Create demo printer for testing the adapter UI
        const demoPrinter = {
            id: 'demo_kobra_s1',
            name: 'Kobra S1 (Demo)',
            model: 'Kobra S1',
            status: 'idle',
            online: true
        };

        await this.createPrinterObjects(demoPrinter);
        this.printers.set(demoPrinter.id, demoPrinter);
        
        // Set demo values
        await this.setStateAsync('demo_kobra_s1.temperature.nozzle', 25, true);
        await this.setStateAsync('demo_kobra_s1.temperature.bed', 22, true);
        await this.setStateAsync('demo_kobra_s1.job.progress', 0, true);
        
        await this.setStateAsync('info.connection', true, true);
        this.log.info('Demo-Drucker erstellt: ' + demoPrinter.name);
    }

    async initLocalPrinters() {
        this.log.info('Initialisiere lokale Drucker (LAN-Modus)...');

        if (!this.config.printers || this.config.printers.length === 0) {
            this.log.warn('Keine lokalen Drucker konfiguriert!');
            return;
        }

        for (const printerConfig of this.config.printers) {
            if (printerConfig.enabled && printerConfig.ip) {
                const printerId = printerConfig.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                
                const printer = {
                    id: printerId,
                    name: printerConfig.name,
                    model: printerConfig.model || 'Kobra',
                    ip: printerConfig.ip,
                    status: 'unknown',
                    online: false,
                    local: true
                };

                this.log.info('Lokaler Drucker: ' + printer.name + ' (' + printer.ip + ')');
                await this.createPrinterObjects(printer);
                this.printers.set(printerId, printer);

                // Set camera URL for Kobra S1
                if (printerConfig.model && printerConfig.model.includes('S1')) {
                    await this.setStateAsync(printerId + '.camera.streamUrl', 
                        'http://' + printerConfig.ip + ':18088/flv', true);
                }
            }
        }

        await this.setStateAsync('info.connection', this.printers.size > 0, true);
    }

    async createPrinterObjects(printer) {
        const id = printer.id;
        this.log.debug('Erstelle Objekte für: ' + id);

        // Device
        await this.setObjectNotExistsAsync(id, {
            type: 'device',
            common: { name: printer.name || 'Anycubic Printer' },
            native: { model: printer.model }
        });

        // Info channel
        await this.setObjectNotExistsAsync(id + '.info', {
            type: 'channel',
            common: { name: 'Information' },
            native: {}
        });

        const infoStates = [
            { sid: 'name', name: 'Name', type: 'string', role: 'text' },
            { sid: 'model', name: 'Modell', type: 'string', role: 'text' },
            { sid: 'status', name: 'Status', type: 'string', role: 'text' },
            { sid: 'online', name: 'Online', type: 'boolean', role: 'indicator.reachable' }
        ];

        for (const s of infoStates) {
            await this.setObjectNotExistsAsync(id + '.info.' + s.sid, {
                type: 'state',
                common: { name: s.name, type: s.type, role: s.role, read: true, write: false },
                native: {}
            });
        }

        // Set initial info values
        await this.setStateAsync(id + '.info.name', printer.name || '', true);
        await this.setStateAsync(id + '.info.model', printer.model || '', true);
        await this.setStateAsync(id + '.info.status', printer.status || 'unknown', true);
        await this.setStateAsync(id + '.info.online', printer.online || false, true);

        // Temperature channel
        await this.setObjectNotExistsAsync(id + '.temperature', {
            type: 'channel',
            common: { name: 'Temperatur' },
            native: {}
        });

        const tempStates = [
            { sid: 'nozzle', name: 'Düse' },
            { sid: 'nozzleTarget', name: 'Düse Soll' },
            { sid: 'bed', name: 'Bett' },
            { sid: 'bedTarget', name: 'Bett Soll' }
        ];

        for (const s of tempStates) {
            await this.setObjectNotExistsAsync(id + '.temperature.' + s.sid, {
                type: 'state',
                common: { name: s.name, type: 'number', role: 'value.temperature', unit: '°C', read: true, write: false },
                native: {}
            });
            await this.setStateAsync(id + '.temperature.' + s.sid, 0, true);
        }

        // Job channel
        await this.setObjectNotExistsAsync(id + '.job', {
            type: 'channel',
            common: { name: 'Druckauftrag' },
            native: {}
        });

        const jobStates = [
            { sid: 'name', name: 'Dateiname', type: 'string', role: 'text' },
            { sid: 'progress', name: 'Fortschritt', type: 'number', role: 'value', unit: '%' },
            { sid: 'timeElapsed', name: 'Zeit vergangen', type: 'number', role: 'value.interval', unit: 's' },
            { sid: 'timeRemaining', name: 'Zeit verbleibend', type: 'number', role: 'value.interval', unit: 's' }
        ];

        for (const s of jobStates) {
            await this.setObjectNotExistsAsync(id + '.job.' + s.sid, {
                type: 'state',
                common: { name: s.name, type: s.type, role: s.role, unit: s.unit || '', read: true, write: false },
                native: {}
            });
        }
        await this.setStateAsync(id + '.job.name', '', true);
        await this.setStateAsync(id + '.job.progress', 0, true);
        await this.setStateAsync(id + '.job.timeElapsed', 0, true);
        await this.setStateAsync(id + '.job.timeRemaining', 0, true);

        // Control channel
        await this.setObjectNotExistsAsync(id + '.control', {
            type: 'channel',
            common: { name: 'Steuerung' },
            native: {}
        });

        const controlStates = [
            { sid: 'pause', name: 'Pause', type: 'boolean', role: 'button' },
            { sid: 'resume', name: 'Fortsetzen', type: 'boolean', role: 'button' },
            { sid: 'stop', name: 'Stopp', type: 'boolean', role: 'button' },
            { sid: 'light', name: 'Licht', type: 'boolean', role: 'switch.light' }
        ];

        for (const s of controlStates) {
            await this.setObjectNotExistsAsync(id + '.control.' + s.sid, {
                type: 'state',
                common: { name: s.name, type: s.type, role: s.role, read: true, write: true },
                native: {}
            });
        }

        // Camera
        await this.setObjectNotExistsAsync(id + '.camera', {
            type: 'channel',
            common: { name: 'Kamera' },
            native: {}
        });

        await this.setObjectNotExistsAsync(id + '.camera.streamUrl', {
            type: 'state',
            common: { name: 'Stream URL', type: 'string', role: 'url', read: true, write: false },
            native: {}
        });

        this.log.info('Datenpunkte erstellt für: ' + printer.name);
    }

    startPolling() {
        const interval = (this.config.pollInterval || 30) * 1000;
        this.pollTimer = setInterval(() => this.pollPrinters(), interval);
        this.log.info('Polling gestartet: alle ' + (interval / 1000) + ' Sekunden');
    }

    async pollPrinters() {
        for (const [printerId, printer] of this.printers) {
            try {
                this.log.debug('Polling: ' + printerId);
                // Polling logic would go here
            } catch (err) {
                this.log.debug('Polling Fehler für ' + printerId + ': ' + err.message);
            }
        }
    }

    async onStateChange(id, state) {
        if (!state || state.ack) return;
        this.log.info('Steuerbefehl: ' + id + ' = ' + state.val);
    }

    onUnload(callback) {
        try {
            if (this.pollTimer) clearInterval(this.pollTimer);
            this.log.info('Adapter gestoppt');
            callback();
        } catch (e) {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = (options) => new AnycubicKobra(options);
} else {
    new AnycubicKobra();
}
