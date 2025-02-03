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
        res.status(500).json({ error: error.message });
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
