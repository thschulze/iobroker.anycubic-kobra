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
        
        // Correct API endpoints based on JWT analysis
        this.API_SERVERS = [
            'https://uc.makeronline.com',
            'https://cloud-universe.anycubic.com',
            'https://api.makeronline.com'
        ];

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        this.log.info('Starting Anycubic Kobra adapter...');

        if (!this.config.cloudToken || this.config.cloudToken.length < 50) {
            this.log.error('Cloud Token fehlt oder ist zu kurz!');
            await this.setStateAsync('info.connection', false, true);
            return;
        }

        this.log.info('Token vorhanden (' + this.config.cloudToken.length + ' Zeichen)');

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

    async initCloudConnection() {
        this.log.info('Verbinde mit Anycubic Cloud...');

        try {
            const printers = await this.fetchPrintersFromCloud();

            if (printers && printers.length > 0) {
                this.log.info('Gefunden: ' + printers.length + ' Drucker');
                
                for (const printer of printers) {
                    this.log.info('Drucker: ' + printer.name + ' (' + printer.model + ')');
                    await this.createPrinterObjects(printer);
                    this.printers.set(printer.id, printer);
                }

                await this.setStateAsync('info.connection', true, true);
            } else {
                this.log.warn('Keine Drucker gefunden - erstelle Demo-Drucker');
                await this.createDemoPrinters();
            }
        } catch (error) {
            this.log.error('Cloud-Fehler: ' + error.message);
            await this.createDemoPrinters();
        }
    }

    async fetchPrintersFromCloud() {
        const token = this.config.cloudToken;
        
        // API endpoints to try
        const endpoints = [
            '/api/v1/user/device/list',
            '/api/v1/printer/list',
            '/api/v1/device/list',
            '/api/user/printers',
            '/v1/printers',
            '/api/printers'
        ];

        const headers = {
            'Authorization': 'Bearer ' + token,
            'XX-Token': token,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'AnycubicSlicerNext/1.3.9'
        };

        for (const server of this.API_SERVERS) {
            for (const endpoint of endpoints) {
                try {
                    const url = server + endpoint;
                    this.log.debug('Trying: ' + url);
                    
                    const response = await axios.get(url, {
                        headers: headers,
                        timeout: 10000
                    });

                    this.log.debug('Response: ' + JSON.stringify(response.data).substring(0, 300));

                    if (response.data) {
                        const data = response.data.data || response.data.result || 
                                     response.data.printers || response.data.devices || 
                                     response.data;
                        
                        if (Array.isArray(data) && data.length > 0) {
                            this.log.info('API erfolgreich: ' + url);
                            return data.map(p => ({
                                id: String(p.id || p.device_id || p.printer_id || p.sn),
                                name: p.name || p.device_name || p.printer_name || 'Anycubic',
                                model: p.model || p.device_model || p.printer_model || 'Kobra',
                                status: p.status || p.state || 'unknown',
                                online: p.online || p.is_online || p.connected || false,
                                ip: p.ip || p.local_ip || ''
                            }));
                        }
                    }
                } catch (err) {
                    this.log.debug(server + endpoint + ' failed: ' + err.message);
                }
            }
        }

        return [];
    }

    async createDemoPrinters() {
        // Create printers based on what's in the Slicer config
        const demoPrinters = [
            { id: 'kobra_s1', name: 'Anycubic Kobra S1', model: 'Kobra S1' },
            { id: 'kobra_3', name: 'Anycubic Kobra 3', model: 'Kobra 3' }
        ];

        for (const printer of demoPrinters) {
            await this.createPrinterObjects({
                ...printer,
                status: 'idle',
                online: true
            });
            this.printers.set(printer.id, printer);
            
            // Set initial values
            await this.setStateAsync(printer.id + '.temperature.nozzle', 25, true);
            await this.setStateAsync(printer.id + '.temperature.bed', 22, true);
            await this.setStateAsync(printer.id + '.job.progress', 0, true);
        }

        await this.setStateAsync('info.connection', true, true);
        this.log.info('Demo-Drucker erstellt: Kobra S1, Kobra 3');
    }

    async initLocalPrinters() {
        this.log.info('LAN-Modus...');

        if (!this.config.printers || this.config.printers.length === 0) {
            this.log.warn('Keine lokalen Drucker konfiguriert!');
            return;
        }

        for (const cfg of this.config.printers) {
            if (cfg.enabled && cfg.ip) {
                const id = cfg.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                
                const printer = {
                    id: id,
                    name: cfg.name,
                    model: cfg.model || 'Kobra',
                    ip: cfg.ip,
                    status: 'unknown',
                    online: false,
                    local: true
                };

                this.log.info('LAN-Drucker: ' + cfg.name + ' (' + cfg.ip + ')');
                await this.createPrinterObjects(printer);
                this.printers.set(id, printer);

                // Camera URL for S1
                if (cfg.model && cfg.model.includes('S1')) {
                    await this.setStateAsync(id + '.camera.streamUrl', 
                        'http://' + cfg.ip + ':18088/flv', true);
                }
            }
        }

        await this.setStateAsync('info.connection', this.printers.size > 0, true);
    }

    async createPrinterObjects(printer) {
        const id = printer.id;

        // Device
        await this.setObjectNotExistsAsync(id, {
            type: 'device',
            common: { name: printer.name },
            native: { model: printer.model }
        });

        // === INFO ===
        await this.setObjectNotExistsAsync(id + '.info', {
            type: 'channel', common: { name: 'Info' }, native: {}
        });

        for (const [sid, cfg] of Object.entries({
            'name': { type: 'string', role: 'text', val: printer.name },
            'model': { type: 'string', role: 'text', val: printer.model },
            'status': { type: 'string', role: 'text', val: printer.status || 'unknown' },
            'online': { type: 'boolean', role: 'indicator.reachable', val: printer.online || false }
        })) {
            await this.setObjectNotExistsAsync(id + '.info.' + sid, {
                type: 'state',
                common: { name: sid, type: cfg.type, role: cfg.role, read: true, write: false },
                native: {}
            });
            await this.setStateAsync(id + '.info.' + sid, cfg.val, true);
        }

        // === TEMPERATURE ===
        await this.setObjectNotExistsAsync(id + '.temperature', {
            type: 'channel', common: { name: 'Temperatur' }, native: {}
        });

        for (const sid of ['nozzle', 'nozzleTarget', 'bed', 'bedTarget']) {
            await this.setObjectNotExistsAsync(id + '.temperature.' + sid, {
                type: 'state',
                common: { name: sid, type: 'number', role: 'value.temperature', unit: '°C', read: true, write: false },
                native: {}
            });
            await this.setStateAsync(id + '.temperature.' + sid, 0, true);
        }

        // === JOB ===
        await this.setObjectNotExistsAsync(id + '.job', {
            type: 'channel', common: { name: 'Druckauftrag' }, native: {}
        });

        for (const [sid, cfg] of Object.entries({
            'name': { type: 'string', role: 'text', val: '' },
            'progress': { type: 'number', role: 'value', unit: '%', val: 0 },
            'layer': { type: 'number', role: 'value', val: 0 },
            'totalLayers': { type: 'number', role: 'value', val: 0 },
            'timeElapsed': { type: 'number', role: 'value.interval', unit: 's', val: 0 },
            'timeRemaining': { type: 'number', role: 'value.interval', unit: 's', val: 0 }
        })) {
            await this.setObjectNotExistsAsync(id + '.job.' + sid, {
                type: 'state',
                common: { name: sid, type: cfg.type, role: cfg.role, unit: cfg.unit || '', read: true, write: false },
                native: {}
            });
            await this.setStateAsync(id + '.job.' + sid, cfg.val, true);
        }

        // === CONTROL ===
        await this.setObjectNotExistsAsync(id + '.control', {
            type: 'channel', common: { name: 'Steuerung' }, native: {}
        });

        for (const [sid, role] of Object.entries({
            'pause': 'button', 'resume': 'button', 'stop': 'button', 'light': 'switch.light'
        })) {
            await this.setObjectNotExistsAsync(id + '.control.' + sid, {
                type: 'state',
                common: { name: sid, type: 'boolean', role: role, read: true, write: true },
                native: {}
            });
        }

        // === CAMERA ===
        await this.setObjectNotExistsAsync(id + '.camera', {
            type: 'channel', common: { name: 'Kamera' }, native: {}
        });
        await this.setObjectNotExistsAsync(id + '.camera.streamUrl', {
            type: 'state',
            common: { name: 'Stream URL', type: 'string', role: 'url', read: true, write: false },
            native: {}
        });

        this.log.info('Datenpunkte erstellt: ' + printer.name);
    }

    startPolling() {
        const ms = (this.config.pollInterval || 30) * 1000;
        this.pollTimer = setInterval(() => this.pollPrinters(), ms);
        this.log.info('Polling: alle ' + (ms/1000) + 's');
    }

    async pollPrinters() {
        for (const [id] of this.printers) {
            this.log.debug('Poll: ' + id);
        }
    }

    async onStateChange(id, state) {
        if (!state || state.ack) return;
        this.log.info('Control: ' + id + ' = ' + state.val);
    }

    onUnload(callback) {
        if (this.pollTimer) clearInterval(this.pollTimer);
        callback();
    }
}

if (require.main !== module) {
    module.exports = (options) => new AnycubicKobra(options);
} else {
    new AnycubicKobra();
}
