const express = require('express');
const B2 = require('backblaze-b2');
const multer = require('multer');
const dotenv = require('dotenv');
const fs = require('fs');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
const stream = require('stream');
const { default: axios } = require('axios');

ffmpeg.setFfmpegPath(ffmpegPath);

dotenv.config()

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
const port = 3000;

let
const b2 = new B2({
    applicationKeyId: process.env.APPLICATION_ID, // or accountId: 'accountId'
    applicationKey: process.env.APPLICATION_KEY // or masterApplicationKey
});

const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB chunk size

/** NOTE : EVERY UPLOAD IN BACKBLAZE SHOULD CONTAIN AUTHORIZATION TOKEN */
b2.authorize().then(() => {
    console.log('B2 authorization successful');
    return b2.getUploadUrl({ bucketId: process.env.BUCKET_ID });
}).then((response) => {
    console.log('Upload URL:', response.data.uploadUrl);
}).catch(err => {
    console.error('Error authorizing B2', err);
});



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


app.get("/download/:fileName", async (req, res) => {
    // const filePath = "uploads/mas.mp4";
    const fileName = req.params.fileName;
    console.log('File fileName:', fileName)
    try {

        const response = await b2.downloadFileByName({
            bucketName: process.env.BUCKET_NAME,
            fileName,
            responseType: 'stream',
        });

        if (!response) {
            res.status(404).send({ error: 'File not found' });
            return;
        }

        const range = req.headers.range;
        if (!range) {
            res.status(400).send('Requires Range header');
            return;
        }
        const videoId = '4_z33d15916f772c01486fd0d1c_f24649063c77588b7_d20240531_m122545_c002_v0001111_t0038_u01717158345886';

        const videoInfo = await b2.getFileInfo({ fileId: videoId });
        const videoSize = videoInfo.data.contentLength;

        const start = Number(range.replace(/\D/g, ''));
        const end = Math.min(start + 10 ** 6, videoSize - 1);

        const contentLength = (end - start) + 1;
        const header = {
            'Content-Range': `bytes ${start}-${end}/${videoSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': contentLength,
            'Content-Type': 'video/mp4',
        };

        res.writeHead(206, header);
        const fileResponse = await axios({
            method: 'get',
            url: `https://f000.backblazeb2.com/file/YOUR_BUCKET_NAME/${videoId}`,
            responseType: 'stream',
            headers: {
                'Authorization': `Bearer ${b2.authorizationToken}`,
                'Range': `bytes=${start}-${end}`
            }
        });

    } catch (error) {
        console.error('Error downloading file:', error);
        res.status(500).send({ error: 'File download failed', details: error.message });
    }
})



app.get('/video/:fileName', (req, res) => {
    const fileName = req.params.fileName;
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Video Player</title>
      </head>
      <body>
        <video width="800" controls>
          <source src="/download/${fileName}" type="video/mp4">
          Your browser does not support the video tag.
        </video>
      </body>
      </html>
    `);
});
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

