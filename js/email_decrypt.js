// email-decrypt.js

function vigenereDecrypt(text, key) {
    let decryptedText = '';
    key = key.toLowerCase();
    let keyIndex = 0;
    
    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        if (charCode >= 65 && charCode <= 90) {
            // Uppercase letters
            decryptedText += String.fromCharCode(((charCode - 65 - (key.charCodeAt(keyIndex % key.length) - 97) + 26) % 26) + 65);
            keyIndex++;
        } else if (charCode >= 97 && charCode <= 122) {
            // Lowercase letters
            decryptedText += String.fromCharCode(((charCode - 97 - (key.charCodeAt(keyIndex % key.length) - 97) + 26) % 26) + 97);
            keyIndex++;
        } else {
            // Non-alphabetic characters
            decryptedText += text[i];
        }
    }
    
    return decryptedText;
}

function writeEmail() {
    // Encrypted email and passkey
    const encryptedEmail = "lzircflu@imah.pn";
    const passkey = "youaintgettingmyemail";

    // Decrypt the email
    const decryptedEmail = vigenereDecrypt(encryptedEmail, passkey);

    const emailUrl = "mailto:" + decryptedEmail;
    
    // Redirect to the decrypted email   
    window.location.href = emailUrl;   
};
