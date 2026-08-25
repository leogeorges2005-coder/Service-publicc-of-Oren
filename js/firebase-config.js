// Configuration Firebase du site.
//
// Comment obtenir ces valeurs :
// 1. Va sur https://console.firebase.google.com et crée un projet (gratuit).
// 2. Dans le projet : Paramètres du projet (roue crantée) > Général.
// 3. Section "Vos applications" > icône "</>" (Web) > donne un nom à l'app.
// 4. Firebase affiche un objet firebaseConfig : copie chaque valeur ci-dessous.
//
// Voir CORONER_SETUP.md à la racine du site pour la procédure complète
// (Authentication, Firestore, Storage, whitelist).
const firebaseConfig = {
  apiKey: "AIzaSyCsG77fTfjeHjFAFpYHAWyYmdf4JUTIGmo",
  authDomain: "coroners-register.firebaseapp.com",
  projectId: "coroners-register",
  storageBucket: "coroners-register.firebasestorage.app",
  messagingSenderId: "1009626515632",
  appId: "1:1009626515632:web:a09567889e74d5ec291375",
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
