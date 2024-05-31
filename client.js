const fs = require("fs");
const { B2 } = require("backblaze-b2");
const { default: axios } = require("axios");
const FormData = require('form-data')

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunk size

const filePath = "uploads/video_2.mp4";

async function uploadFile(filePath) {
    const fileName = filePath.split('/').pop(); // fileName
    const fileSize = fs.statSync(filePath).size; // fileSize
    const totalParts = Math.ceil(fileSize / CHUNK_SIZE); // total chunk parts

    // Step 1: Initiate large file upload
    const initResponse = await axios.post(`http://localhost:3000/initiate-upload?fileName=${fileName}`);
    console.log(initResponse.data)
    const { message, data } = initResponse.data;
    const fileId = data.fileId;
    console.log('Large file upload initiated:', fileId);

    // Step 2: Upload parts
    /**
     * When uploading parts, we need to keep track of the SHA1 hash of each part.
     * This is because we need to provide the SHA1 hash of the entire file when finishing the upload.
     */
    const partSha1Array = [];
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
        const start = (partNumber - 1) * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, fileSize); // 0 - 10MB, 10MB - 20MB, 20MB - 30MB, etc.
        const filePart = fs.createReadStream(filePath, { start, end: end - 1 });

        const formData = new FormData();
        formData.append('filePart', filePart); // append blob to form data

        const uploadPartResponse = await axios.post(`http://localhost:3000/upload-part?fileId=${fileId}&partNumber=${partNumber}`, formData, {
            headers: formData.getHeaders()
        });

        const { message, data } = uploadPartResponse.data;
        partSha1Array.push(data.contentSha1); // Save the SHA1 hash of the part
    }
    console.log('Parts uploaded:', partSha1Array)
    // Step 3: Finish large file upload
    const finishResponse = await axios.post(`http://localhost:3000/finish-upload?fileId=${fileId}`, { partSha1Array },
        { headers: { 'Content-Type': 'application/json' } });
    console.log('Large file upload completed:', finishResponse.data);
}

uploadFile(filePath).catch((err) => {
    console.error('Error uploading file:', err.message);
});


// const fileSize = 209922807;
// const start = 0 * CHUNK_SIZE;
// const end = Math.min(start + CHUNK_SIZE, fileSize); // 0 - 10MB, 10MB - 20MB, 20MB - 30MB, etc.
// const filePart = fs.createReadStream(filePath, { start, end: end - 1 });
// console.log({ filePart });
// console.log({ fileSize });
// const formData = new FormData();
// formData.append('filePart', filePart); // append blob to form data

// console.log(formData.getAll('filePart'));
