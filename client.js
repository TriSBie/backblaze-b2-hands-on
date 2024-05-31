const fs = require("fs");
const { B2 } = require("backblaze-b2");

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunk size

const filePath = "uploads/video.mp4";

async function uploadFile(filePath) {
    const fileName = filePath.split('/').pop();
    const fileSize = fs.statSync(filePath).size;
    const totalParts = Math.ceil(fileSize / CHUNK_SIZE);

    // Step 1: Initiate large file upload
    const initResponse = await axios.post(`http://localhost:3000/initiate-upload?fileName=${fileName}`);
    const fileId = initResponse.data.fileId;
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
            headers: formData.getHeaders(),
        });

        partSha1Array.push(uploadPartResponse.data.data.contentSha1); // Save the SHA1 hash of the part
        console.log(`Uploaded part ${partNumber}/${totalParts}`);
    }
    // Step 3: Finish large file upload
    const finishResponse = await axios.post(`http://localhost:3000/finish-upload?fileId=${fileId}`, { partSha1Array });
    console.log('Large file upload completed:', finishResponse.data);
}

// const fileSize = 209922807;
// const start = 0 * CHUNK_SIZE;
// const end = Math.min(start + CHUNK_SIZE, fileSize); // 0 - 10MB, 10MB - 20MB, 20MB - 30MB, etc.
// const filePart = fs.createReadStream(filePath, { start, end: end - 1 });
// console.log({ filePart });
// console.log({ fileSize });
// const formData = new FormData();
// formData.append('filePart', filePart); // append blob to form data

// console.log(formData.getAll('filePart'));
// // uploadFile(filePath);