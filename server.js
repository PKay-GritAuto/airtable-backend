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

// Root-Route für Health-Check (wichtig für Railway!)
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

        // ✅ 3. Datum ins korrekte Format bringen
        let Termin_Datum = datum ? new Date(datum).toISOString().split("T")[0] : null;

        // ✅ 4. Uhrzeit formatieren (nur Stunden & Minuten)
        let Termin_Uhrzeit = uhrzeit ? uhrzeit.replace(/[{}]/g, '').trim() : null;

        // Falls Airtable eine vollständige Uhrzeit erwartet:
        if (Termin_Uhrzeit && Termin_Uhrzeit.length === 5) {
            Termin_Uhrzeit += ":00"; // Sekundengenauigkeit hinzufügen ("15:00:00")
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

// 🗑 **Einen Termin löschen**
app.delete('/api/termine/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const response = await axios.delete(`${AIRTABLE_URL}/${id}`, { headers: airtableHeaders });
        res.json({ message: '✅ Termin gelöscht!', response: response.data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🚀 **Server starten**
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`✅ Server läuft auf Port ${PORT}`);
});
