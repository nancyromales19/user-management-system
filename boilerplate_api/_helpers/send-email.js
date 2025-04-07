const nodemailer = require('nodemailer');
const config = require('config.json');

module.exports = sendEmail;


async function sendEmail({ to, subject, html, from = config.emailFrom }) {
    const transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        auth: {
            user: 'charlene17@ethereal.email',
            pass: 'B2wq9VN7cvuRrbh7ed'
        }
    });
    await transporter.sendMail({ from, to, subject, html});
}



