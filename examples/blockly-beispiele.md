# Blockly Beispiele für Anycubic Kobra Adapter

## Benachrichtigung bei Druckende

Dieses Blockly-Skript sendet eine Telegram-Nachricht, wenn ein Druck abgeschlossen ist.

### Trigger
- **Wenn**: Objekt `anycubic-kobra.0.*.job.progress` sich ändert
- **Bedingung**: Wert = 100

### Aktionen
1. Telegram-Nachricht senden: "3D-Druck abgeschlossen!"

---

## Automatische Beleuchtung

### Bei Druckstart
- **Wenn**: Status = "printing"
- **Dann**: Setze `control.light` auf `true`

### Bei Druckende
- **Wenn**: Status = "idle"
- **Dann**: Setze `control.light` auf `false`

---

## JavaScript-Äquivalente

```javascript
// Benachrichtigung bei Druckende
on({id: 'anycubic-kobra.0.*.job.progress', change: 'ne'}, function(obj) {
    if (obj.state.val === 100) {
        sendTo('telegram.0', {text: '✅ 3D-Druck abgeschlossen!'});
    }
});

// Automatische Beleuchtung
on({id: 'anycubic-kobra.0.*.info.status', change: 'ne'}, function(obj) {
    const printerId = obj.id.split('.')[2];
    const lightState = (obj.state.val === 'printing');
    setState(`anycubic-kobra.0.${printerId}.control.light`, lightState);
});
```
