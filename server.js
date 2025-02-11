const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Airtable API Config
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_ACCESS_TOKEN = process.env.AIRTABLE_ACCESS_TOKEN;
const TABLE_NAME = 'Imported table';
const AIRTABLE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}`;

// Header für Airtable API
const airtableHeaders = {
    'Authorization': `Bearer ${AIRTABLE_ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
};

// ✅ Health-Check (Wichtig für Railway)
app.get('/', (req, res) => {
    res.send("✅ Airtable Backend läuft!");
});

// 🔍 **Alle Termine abrufen**
app.get('/api/termine', async (req, res) => {
    try {
        const response = await axios.get(AIRTABLE_URL, { headers: airtableHeaders });

        const formattedData = response.data.records.map(record => ({
            id: record.id,
            kunde: record.fields.kunde || '',
            telefonnummer: record.fields.telefonnummer || '',
            Termin_Datum: record.fields.Termin_Datum || '',
            Termin_Uhrzeit: record.fields.Termin_Uhrzeit || '',
            dienstleistung: record.fields.dienstleistung || '',
            status: record.fields.status || '',
            email: record.fields.email || ''
        }));

        res.json(formattedData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🔍 **Terminverfügbarkeit prüfen**
app.get('/api/pruefe-termin', async (req, res) => {
    const { Termin_Datum, Termin_Uhrzeit, dienstleistung } = req.query;

    try {
        const response = await axios.get(AIRTABLE_URL, { headers: airtableHeaders });

        const termine = response.data.records.map(record => ({
            Termin_Datum: record.fields.Termin_Datum || '',
            Termin_Uhrzeit: record.fields.Termin_Uhrzeit || '',
            dienstleistung: record.fields.dienstleistung || '',
        }));

        const terminVorhanden = termine.some(t => 
            t.Termin_Datum === Termin_Datum && t.Termin_Uhrzeit === Termin_Uhrzeit && t.dienstleistung === dienstleistung
        );

        res.json({ verfuegbar: !terminVorhanden });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 📝 **Neuen Termin hinzufügen (Voiceflow POST-Request)**
app.post('/api/schreibe-termin', async (req, res) => {
    try {
        // ✅ 1. Eingehende Daten loggen
        console.log("📥 Eingehender Voiceflow-Request:", req.body);

        // ✅ 2. Variablen auslesen
        const {
            kunde,
            telefonnummer,
            datum,          // Alte Schreibweise aus Voiceflow
            uhrzeit,        // Alte Schreibweise aus Voiceflow
            dienstleistung,
            status,
            email
        } = req.body;

        // ✅ 3. Datum ins korrekte Format bringen (YYYY-MM-DD)
        let Termin_Datum = null;
        if (datum) {
            let parsedDate = new Date(datum);
            if (!isNaN(parsedDate.getTime())) {
                Termin_Datum = parsedDate.toISOString().split("T")[0];
            } else {
                console.error("❌ Ungültiges Datumsformat:", datum);
                return res.status(400).json({ error: "Ungültiges Datum! Erwartetes Format: YYYY-MM-DD" });
            }
        }

        // ✅ 4. Uhrzeit ins `HH:mm` Format konvertieren
        let Termin_Uhrzeit = null;
        if (uhrzeit) {
            Termin_Uhrzeit = uhrzeit.replace(/[{} ]/g, '').trim(); // `{15:00}` → `15:00`
            Termin_Uhrzeit = Termin_Uhrzeit.replace(/\./g, ":").replace(/-/g, ":"); // `15.00` → `15:00`

            // Falls `HH:mm:ss`, entferne Sekunden (`15:00:30` → `15:00`)
            if (/^\d{1,2}:\d{2}:\d{2}$/.test(Termin_Uhrzeit)) {
                Termin_Uhrzeit = Termin_Uhrzeit.substring(0, 5);
            }

            // Falls Stunde einstellig ist (`9:30` → `09:30`)
            if (/^\d:\d{2}$/.test(Termin_Uhrzeit)) {
                Termin_Uhrzeit = "0" + Termin_Uhrzeit;
            }

            // Falls das Format immer noch nicht `HH:mm` ist → Fehler
            if (!/^\d{2}:\d{2}$/.test(Termin_Uhrzeit)) {
                console.error("❌ Ungültiges Zeitformat:", Termin_Uhrzeit);
                return res.status(400).json({ error: "Ungültige Uhrzeit! Erwartetes Format: HH:mm" });
            }
        }

        // ✅ 5. Fehlende Felder prüfen
        if (!kunde || !telefonnummer || !Termin_Datum || !Termin_Uhrzeit || !dienstleistung) {
            console.error("❌ Fehlende Felder:", { kunde, telefonnummer, Termin_Datum, Termin_Uhrzeit, dienstleistung, email });
            return res.status(400).json({ error: "Fehlende Felder! Bitte alle erforderlichen Daten senden." });
        }

        // ✅ 6. Telefonnummer formatieren (z.B. +49 statt führende 0)
        let formattedTelefonnummer = telefonnummer.trim();
        if (formattedTelefonnummer.startsWith("0")) {
            formattedTelefonnummer = "+49" + formattedTelefonnummer.substring(1);
        }

        // ✅ 7. Debugging-Log für korrigierte Werte
        console.log("📤 Nach Korrektur - Eingehende Daten:", { 
            kunde, 
            telefonnummer: formattedTelefonnummer, 
            Termin_Datum, 
            Termin_Uhrzeit, 
            dienstleistung, 
            status, 
            email 
        });

        // ✅ 8. Daten für Airtable vorbereiten
        const airtableData = {
            records: [{
                fields: {
                    kunde,
                    telefonnummer: formattedTelefonnummer,
                    Termin_Datum,  // Jetzt im richtigen Format
                    Termin_Uhrzeit,
                    dienstleistung,
                    status: status || "Geplant",
                    email: email || ""
                }
            }]
        };

        // ✅ 9. Anfrage an Airtable senden
        const response = await axios.post(AIRTABLE_URL, airtableData, { headers: airtableHeaders });

        // ✅ 10. Erfolgreiche Antwort zurückgeben
        console.log("✅ Termin erfolgreich gespeichert:", response.data);
        res.json({
            success: true,
            message: "Termin erfolgreich gespeichert!",
            data: response.data
        });

    } catch (error) {
        console.error("⚠️ Fehler beim Speichern:", error.response ? error.response.data : error.message);
        res.status(500).json({ 
            error: "Serverfehler beim Speichern des Termins",
            details: error.response ? error.response.data : "Keine weiteren Informationen"
        });
    }
});

// 🚀 **Server starten**
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`✅ Server läuft auf Port ${PORT}`);
});
