const express= require('express');
const app=express();
const port=8005;
const path=require('path');
const cors=require('cors');
const fs=require('fs');
const {promisify} = require('util');
const Busboy=require('busboy');

app.set('view engine','ejs');
app.set('views',path.join(__dirname,'views'));

app.use(express.static('assets'));
app.use(express.json());
app.use(cors());

const getFileDetails = promisify(fs.stat);

const uniqueAlphaNumericId = (() => {
	const heyStack = '0123456789abcdefghijklmnopqrstuvwxyz';
	const randomInt = () => Math.floor(Math.random() * Math.floor(heyStack.length));
	
	return (length = 24) => Array.from({length}, () => heyStack[randomInt()]).join('');
})();

const getFilePath = (fileName, fileId) => `./uploads/file-${fileId}-${fileName}`;

app.get('/cancel',(req,res)=>{
    if(req.query && req.query.fileName && req.query.fileId){
        getFileDetails(getFilePath(req.query.fileName,req.query.fileId))
        .then(stats=>{
            
            fs.unlink(getFilePath(req.query.fileName,req.query.fileId),function(err){
                if (err) throw err;
                else
                {
                    console.log('File deleted!');
                }
                
            })
            res.status(200);
        })
        .catch(e=>{
            console.error('failed to read file',e);
            res.status(500);
        })
    }
    else{
        return res.status(400).json({
            message:'No file with provided credentials',credentials:{...req.query}
        });
    }
});

app.post('/upload_request',(req,res)=>{
    if(!req.body || !req.body.fileName)
    {
        res.status(400).json({message:'Missing "fileName"'})
    }
    else{
        const fileId=uniqueAlphaNumericId();
        fs.createWriteStream(getFilePath(req.body.fileName, fileId), {flags: 'w'});
		res.status(200).json({fileId,fileName:req.body.fileName});
	} 
});

app.get('/upload_status',(req,res)=>{
    if(req.query && req.query.fileName && req.query.fileId){
        getFileDetails(getFilePath(req.query.fileName,req.query.fileId))
        .then(stats=>{
            res.status(200).json({totalChunkUploaded:stats.size})
        })
        .catch(e=>{
            console.error('failed to read file',e);
            res.status(500);
        })
    }
    else{
        return res.status(400).json({
            message:'No file with provided credentials',credentials:{...req.query}
        });
    }
});

app.post('/upload',(req,res)=>{
    const contentRange=req.headers['content-range'];
    const fileId=req.headers['x-file-id'];

    if(!contentRange){
        return res.status(400).json({message:'Missing "Content-Range"'});
    }

    if(!fileId){
        return res.status(400).json({message:'Missing "X-File-Id" Header'});
    }

    const match=contentRange.match(/bytes=(\d+)-(\d+)\/(\d+)/);

    if(!match){
        return res.status(400).json({message:'Invalid "Content-Range" Format'});
    }

    const rangeStart=Number(match[1]);
    const rangeEnd=Number(match[2]);
    const fileSize=Number(match[3]);

    if(rangeStart>=fileSize || rangeStart>=rangeEnd || rangeEnd>fileSize){
        return res.status(400).json({message:'Invalid "Content-Range" Provided'});
    }
     
    const busBoy=new Busboy({headers:req.headers});

    busBoy.on('error',e=>{
        console.error('Failed to read file',e);
        res.sendStatus(500);
    });

    busBoy.on('finish',e=>{
        res.sendStatus(200);
    });

    busBoy.on('file', (_,file,fileName)=>{
        const filePath=getFilePath(fileName,fileId);

        getFileDetails(filePath)
        .then(stats=>{
            if(stats.size!==rangeStart){
                return res.status(400).json({message:'Bad Chunk Range Start'});
            }
            file.pipe(fs.createWriteStream(filePath,{flags:'a'}));
        })
        .catch(e=>{
            console.error('failed to read file',e);
            return res.status(400).json({
                message:'No file with provided credentials',credentials:{
                    fileId,
                    fileName
                }
            })
        })
    })

    req.pipe(busBoy);
});

app.get('/',(req,res)=>{
    return res.render('index');
});

app.listen(port,(error)=>{
    if(error)
    {
        console.log(` --Error-- ${error}`);
    }
    console.log(`--Success-- Server is up and running on ${port}`);
});