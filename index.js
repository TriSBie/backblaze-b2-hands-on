const express = require('express');
const B2 = require('backblaze-b2');
const multer = require('multer');
const dotenv = require('dotenv');
const fs = require('fs');
dotenv.config()

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
const port = 3000;

const b2 = new B2({
    applicationKeyId: process.env.APPLICATION_ID, // or accountId: 'accountId'
    applicationKey: process.env.APPLICATION_KEY // or masterApplicationKey
});

const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB chunk size


// Start Large File Upload
async function startLargeFileUpload(bucketId, fileName) {
    const response = await b2.startLargeFile({
        bucketId,
        fileName,
        contentType: 'application/octet-stream',
    });
    return response.data.fileId;
}
// Upload File Part
async function uploadPart(fileId, partNumber, partData) {
    const response = await b2.getUploadPartUrl({ fileId });
    const { uploadUrl, authorizationToken } = response.data;

    const uploadResponse = await axios.post(uploadUrl, partData, {
        headers: {
            Authorization: authorizationToken,
            'X-Bz-Part-Number': partNumber,
            'Content-Length': partData.length,
            'X-Bz-Content-Sha1': 'do_not_verify',
        },
    });

    return uploadResponse.data;
}

/** NOTE : EVERY UPLOAD IN BACKBLAZE SHOULD CONTAIN AUTHORIZATION TOKEN */
b2.authorize().then(() => {
    console.log('B2 authorization successful');
    return b2.getUploadUrl({
        bucketId: process.env.BUCKET_ID // or bucketName: 'bucketName
    })
})
    .catch(err => {
        console.error('Error authorizing B2', err);
    });

app.get('/', (req, res) => {
    res.send('Hello, World!');
});

/**
 * Initiate file upload
 *  
 */
app.post("/initiate-upload", async (req, res) => {
    const fileName = req.query.fileName
    const bucketId = process.env.BUCKET_ID; // replace with your Bucket ID
    try {
        const response = await b2.startLargeFile({
            bucketId,
            fileName,
            contentType: 'application/octet-stream',
        });

        res.status(200).send({ message: 'File upload initiated', data: response.data });
    } catch (error) {
        console.error('Error initiating file upload:', error);
        res.status(500).send({ error: 'File upload initiation failed', details: error.message });
    }
});

app.post("/upload", upload.single('file'), async (req, res) => {
    const file = req.file;
    console.log('File:', file);

    try {
        const filePath = req.file.path;
        const fileName = req.file.originalname;
        const bucketId = process.env.BUCKET_ID; // replace with your Bucket ID

        // Get upload URL
        const uploadUrlResponse = await b2.getUploadUrl({ bucketId });
        const { uploadUrl, authorizationToken } = uploadUrlResponse.data;

        // Read the file
        const fs = require('fs');
        const fileData = fs.readFileSync(filePath);

        // Upload the file
        const uploadResponse = await b2.uploadFile({
            uploadUrl,
            uploadAuthToken: authorizationToken,
            fileName,
            data: fileData,
            onUploadProgress: (event) => {
                console.log('Upload Progress:', event);
            },
        });

        // Cleanup: Remove the file from the server
        fs.unlinkSync(filePath);

        res.status(200).send({ message: 'File uploaded successfully', data: uploadResponse.data.fileId });
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).send({ error: 'File upload failed', details: error.message });
    }
})

// since we are using the same function for both the endpoints, we can refactor it to a single function
app.post('/upload-part', upload.single('filePart'), async (req, res) => {
    try {
        const fileId = req.query.fileId;
        const partNumber = parseInt(req.query.partNumber, 10);
        console.log(req.file)
        const filePath = req.file.path;
        const fileData = fs.readFileSync(filePath);

        const uploadPartUrlResponse = await b2.getUploadPartUrl({ fileId });
        const { uploadUrl, authorizationToken } = uploadPartUrlResponse.data;

        const uploadResponse = await b2.uploadPart({
            uploadUrl,
            uploadAuthToken: authorizationToken,
            partNumber,
            data: fileData,
            onUploadProgress: (event) => {
                console.log('Upload Progress:', event);
            },
        });

        fs.unlinkSync(filePath);
        console.log('File part uploaded data:', uploadResponse.data)

        res.status(200).send({
            partNumber,
            message: 'File part uploaded successfully',
            data: uploadResponse.data,
        });
    } catch (error) {
        console.error('Error uploading file part:', error);
        res.status(500).send({ error: new Error('File part upload failed'), details: error.message });
    }
});

app.post("/finish-upload", async (req, res) => {
    const fileId = req.query.fileId;
    const partSha1Array = req.body.partSha1Array;
    console.log('File ID:', fileId, 'Part SHA1 Array:', partSha1Array)
    try {
        const response = await b2.finishLargeFile({
            fileId,
            partSha1Array,
        });

        res.status(200).send({ message: 'File upload completed', data: response.data });
    } catch (error) {
        console.error('Error finishing file upload:', error);
        res.status(500).send({ error: 'File upload completion failed', details: error.message });
    }
});

app.get("/download", async (req, res) => {
    const fileName = req.query.fileName;
    try {
        const response = await b2.downloadFileByName({
            bucketName: process.env.BUCKET_NAME,
            fileName,
        });

        res.status(200).send({ message: 'File downloaded', data: response.data });
    } catch (error) {
        console.error('Error downloading file:', error);
        res.status(500).send({ error: 'File download failed', details: error.message });
    }
})
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

