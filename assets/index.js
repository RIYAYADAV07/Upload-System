const uploadFiles=(()=>{
    const fileRequests= new WeakMap();
    const defaultOptions={
        url:'/',
        fileId:null,
        startingByte:0,
        onAbort(){},
        onError(){},
        onProgress(){},
        onComplete(){},
    };

    const uploadFileChunks=(file,options)=>{
        const req= new XMLHttpRequest();
        const formData=new FormData();
        const chunk=file.slice(options.startingByte);

        formData.append('chunk',chunk,file.name);
        formData.append('fileId',options.fileId);

        req.open('POST',options.url,true);

        req.setRequestHeader('X-File-Id',options.fileId);
        // req.setRequestHeader('Content-Length',chunk.size);
        req.setRequestHeader('Content-Range',`bytes=${options.startingByte}-${options.startingByte+chunk.size}/${file.size}`);

        req.onload=(e)=>options.onComplete(e,file);
        req.onerror=(e)=>options.onError(e,file);
        req.ontimeout=(e)=>options.onError(e,file);
        req.upload.onprogress=(e) => {
			const loaded = options.startingByte + e.loaded;
			options.onProgress({...e,
				loaded,
				total: file.size,
				percentage: loaded * 100 / file.size
			}, file);
		}
		
        req.onabort=(e)=>options.onAbort(e,file);
        fileRequests.get(file).request=req;
        req.send(formData);
    };

    const uploadFile=(file,options)=>{
        fetch('http://localhost:8005/upload_request',{
            method:'POST',
            headers:{
                'Content-Type':'application/json'
            },
            body:JSON.stringify({fileName:file.name,})
        })
        .then(res=>res.json())
        .then(res=>{
            options={...options,fileId:res.fileId};
            fileRequests.set(file,{request:null,options});
            uploadFileChunks(file,options)
        })
    };

    const abortFileUpload=file=>{

        const fileReq=fileRequests.get(file);
        if(fileReq){
            fileReq.request.abort();
        }
    }

    const cancelFileUpload=file=>{

        abortFileUpload(file);        
        const fileReq=fileRequests.get(file);
        fetch(`http://localhost:8005/cancel?fileName=${file.name}&fileId=${fileReq.options.fileId}`)
        .then(res=>res.json())
        .then(res=>{
            console.log('--Cancel--',res);
            fileRequests.delete(file);
        })
        .catch(e => {
            fileReq.options.onError({...e, file})
        })
        window.location.reload(true);
        
    }

    const resumeFileUpload=file=>{
        const fileReq=fileRequests.get(file);
        fetch(`http://localhost:8005/upload_status?fileName=${file.name}&fileId=${fileReq.options.fileId}`)
        .then(res=>res.json())
        .then(res=>{
            console.log('--Status--',res);
            uploadFileChunks(file, {...fileReq.options, startingByte: Number(res.totalChunkUploaded)});
        })
        .catch(e => {
            fileReq.options.onError({...e, file})
        })
    }
    
    return (files, options = defaultOptions) => {
        [...files].forEach(file => uploadFile(file, {...defaultOptions, ...options}));
        
        return {
            abortFileUpload,
            cancelFileUpload,
            resumeFileUpload
        }
	}
})();


const uploadingFiles=(()=>{
    let uploader={};
    const FILE_STATUS={
        PENDING: 'pending',
		UPLOADING: 'uploading',
		PAUSED: 'paused',
		COMPLETED: 'completed',
		FAILED: 'failed'
    }
    const files=new Map();
    const progressBox=document.createElement('div');
    progressBox.className='upload-progress-tracker';
    progressBox.innerHTML=`
    <h4 class="heading">Upload</h4>
    <div class="file-progress"></div>
    `;

    const filesProgress=progressBox.querySelector('.file-progress');

    const setFileElement=file=>{
        const fileElement=document.createElement('div');
        fileElement.className='upload-progress-tracker';
        fileElement.innerHTML=`
        <div class="file-details">
        <p><span class="file_name">${file.name} </span><span class="file-status">${FILE_STATUS.PENDING}</span></p>
        <div class="progress-bar" style="width:0; height:2px; background:green;"></div>
        </div>
        <div class="file-actions">
            <button type="button" class="pause-btn">Pause</button>
            <button type="button" class="resume-btn">Resume</button>
            <button type="button" class="cancel-btn">Cancel</button>
        </div>
        `;

        files.set(file,{
            status:FILE_STATUS.PENDING,
            size:file.size,
            percentage:0,
            fileElement
        });

        const [,{children:[pauseBtn,resumeBtn,cancelBtn]}]=fileElement.children;
        pauseBtn.addEventListener('click',()=>uploader.abortFileUpload(file));
        resumeBtn.addEventListener('click',()=>uploader.resumeFileUpload(file));
        cancelBtn.addEventListener('click',()=>uploader.cancelFileUpload(file));

        filesProgress.appendChild(fileElement);
    }

    const updateFileElement=fileObj=>{
        const [{children:[{children:[,fileStatus]},progressBar]}]=fileObj.fileElement.children;

        requestAnimationFrame(()=>{
            fileStatus.textContent=fileObj.status;
            fileStatus.className=`status ${fileObj.status}`;
            progressBar.style.width=fileObj.percentage+'%';
        });
    }

    const onProgress=(e, file)=>{
        console.log('--Progress--');
        const fileObj = files.get(file);
		
		fileObj.status = FILE_STATUS.UPLOADING;
		fileObj.percentage = e.loaded*100/e.total;
		// fileObj.uploadedChunkSize = e.loaded;
		
		updateFileElement(fileObj);
    };
    const onError=(e, file)=>{
        console.log('--Error--',e);
        const fileObj = files.get(file);
		
		fileObj.status = FILE_STATUS.FAILED;
		fileObj.percentage = 100;
		
		updateFileElement(fileObj);
    };
    const onAbort=(e, file)=>{
        console.log('--Abort--');
        const fileObj = files.get(file);
		
		fileObj.status = FILE_STATUS.PAUSED;
		
		updateFileElement(fileObj);
    };
    const onComplete=(e, file)=>{
        console.log('--Complete--');
        const fileObj = files.get(file);
		
		fileObj.status = FILE_STATUS.COMPLETED;
		fileObj.percentage = 100;
		
		updateFileElement(fileObj);
    };

    return (uploadedFiles)=>{
        [...uploadedFiles].forEach(setFileElement);

       uploader= uploadFiles(uploadedFiles,{
            url:'http://localhost:8005/upload',
            onComplete,
            onAbort,
            onError,
            onProgress
        });

        document.body.appendChild(progressBox);
    }
}
)();

const uploadBTN=document.getElementById('upload-btn');

uploadBTN.addEventListener('change',e=>{
    console.log('--Event--',e);
    uploadingFiles(e.target.files);
});