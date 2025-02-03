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
    res.send("Airtable Backend läuft!");
});
app.get('/check-env', (req, res) => {
    res.json({
        AIRTABLE_BASE_ID: AIRTABLE_BASE_ID,
        AIRTABLE_ACCESS_TOKEN: AIRTABLE_ACCESS_TOKEN ? 'EXISTS' : 'MISSING'
    });
});
// Alle Termine abrufen
app.get('/api/termine', async (req, res) => {
    try {
        const response = await axios.get(AIRTABLE_URL, { headers: airtableHeaders });

        // Datum & Uhrzeit formatieren
        const formattedData = response.data.records.map(record => ({
            id: record.id,
            kunde: record.fields.kunde || '',
            telefonnummer: record.fields.telefonnummer || '',
            terminDatum: record.fields.terminDatum || '',
            terminZeit: record.fields.terminZeit || '',
            dienstleistung: record.fields.dienstleistung || '',
            status: record.fields.status || '',
            email: record.fields.email || ''
        }));

        res.json(formattedData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Terminverfügbarkeit prüfen
app.get('/api/pruefe-termin', async (req, res) => {
    const { datum, uhrzeit, dienstleistung } = req.query;

    try {
        const response = await axios.get(AIRTABLE_URL, { headers: airtableHeaders });

        // Alle bestehenden Termine durchsuchen
        const termine = response.data.records.map(record => ({
            terminDatum: record.fields.terminDatum || '',
            terminZeit: record.fields.terminZeit || '',
            dienstleistung: record.fields.dienstleistung || '',
        }));

        // Prüfen, ob der Termin bereits existiert
        const terminVorhanden = termine.some(t => 
            t.terminDatum === datum && t.terminZeit === uhrzeit && t.dienstleistung === dienstleistung
        );

        res.json({ verfuegbar: !terminVorhanden });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Neuen Termin hinzufügen – /api/schreibe-termin
app.post('/api/schreibe-termin', async (req, res) => {
    try {
        // ✅ 1. Request-Daten auslesen
        const { kunde, telefonnummer, terminDatum, terminZeit, dienstleistung, status, email } = req.body;

        // ✅ 2. Grundvalidierung der Felder
        if (!kunde || !telefonnummer || !terminDatum || !terminZeit || !dienstleistung) {
            return res.status(400).json({ error: "Fehlende Felder! Bitte alle erforderlichen Daten senden." });
        }

        // ✅ 3. Telefonnummer formatieren (sichert +49 oder führende 0)
        let formattedTelefonnummer = telefonnummer.trim();
        if (formattedTelefonnummer.startsWith("0")) {
            formattedTelefonnummer = "+49" + formattedTelefonnummer.substring(1);
        }

        // ✅ 4. Daten für Airtable vorbereiten
        const airtableData = {
            records: [{
                fields: {
                    kunde,
                    telefonnummer: formattedTelefonnummer,
                    terminDatum,
                    terminZeit,
                    dienstleistung,
                    status: status || "Geplant", // Standardwert setzen
                    email: email || "" // Falls kein E-Mail vorhanden ist
                }
            }]
        };

        // ✅ 5. Anfrage an Airtable senden
        const response = await axios.post(AIRTABLE_URL, airtableData, { headers: airtableHeaders });

        // ✅ 6. Erfolgreiche Antwort zurückgeben
        res.json({
            success: true,
            message: "Termin erfolgreich gespeichert!",
            data: response.data
        });

    } catch (error) {
        console.error("Fehler beim Erstellen eines Termins:", error.response ? error.response.data : error.message);
        res.status(500).json({ 
            error: "Serverfehler beim Speichern des Termins",
            details: error.response ? error.response.data : "Keine weiteren Informationen"
        });
    }
});


// Neuen Termin hinzufügen
app.post('/api/termine', async (req, res) => {
    const { kunde, telefonnummer, terminDatum, terminZeit, dienstleistung, status, email } = req.body;

     // 🔍 Logging der empfangenen Daten
    console.log("📤 Gesendete Daten an Airtable:", { kunde, telefonnummer, terminDatum, terminZeit, dienstleistung, status, email });
    
    try {
        const response = await axios.post(AIRTABLE_URL, {
            records: [{
                fields: { kunde, telefonnummer, terminDatum, terminZeit, dienstleistung, status, email }
            }]
        }, { headers: airtableHeaders });

        res.json(response.data);
     } catch (error) {
        console.error("Fehler bei der Termin-Erstellung:", error.response ? error.response.data : error.message);
        res.status(500).json({ 
            error: error.message, 
            details: error.response ? error.response.data : "Keine zusätzlichen Details verfügbar" 
        });
    }
});

// Einen Termin löschen
app.delete('/api/termine/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const response = await axios.delete(`${AIRTABLE_URL}/${id}`, { headers: airtableHeaders });
        res.json({ message: 'Termin gelöscht!', response: response.data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Server starten
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});
