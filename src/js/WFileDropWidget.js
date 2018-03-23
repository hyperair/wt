/*
 * Copyright (C) 2016 Emweb bvba, Herent, Belgium.
 *
 * See the LICENSE file for terms of use.
 */

/* Note: this is at the same time valid JavaScript and C++. */

WT_DECLARE_WT_MEMBER
(1, JavaScriptConstructor, "WFileDropWidget",
 function(APP, dropwidget, maxFileSize) {

   jQuery.data(dropwidget, 'lobj', this);
   
   var self = this, WT = APP.WT;
   var hoverClassName = 'Wt-filedropzone-hover';

   var uploads = [];
   var sending = false;
   var acceptDrops = true;
   var bodyAware = false;
   var bodyDropForward = false;

   var dragState = 0;

   var hiddenInput = document.createElement('input');
   hiddenInput.type = 'file';
   hiddenInput.setAttribute('multiple', 'multiple');
   $(hiddenInput).hide();
   dropwidget.appendChild(hiddenInput);

   var dropcover = document.createElement('div');
   $(dropcover).addClass('Wt-dropcover');
   document.body.appendChild(dropcover)

   this.eventContainsFile = function(e) {
     var items = (e.dataTransfer.items != null &&
		  e.dataTransfer.items.length > 0 &&
		  e.dataTransfer.items[0].kind == 'file');
     var types = (e.dataTransfer.types != null &&
		  e.dataTransfer.types.length > 0 &&
		  e.dataTransfer.types[0] == 'Files');
     return items || types;
   };

   this.validFileCheck = function(file, callback, url) {
     var reader = new FileReader();
     reader.onload = function() {
       callback(true, url);
     }
     reader.onerror = function() {
       callback(false, url);
     }
     reader.readAsText(file.slice(0, 32)); // try reading some bytes
   }

   dropwidget.setAcceptDrops = function(enable) {
     acceptDrops = enable
   };

   dropwidget.setBodyAware = function(enable) {
     bodyAware = enable;
   };
   
   dropwidget.setDropForward = function(enable) {
     bodyDropForward = enable;
   };

   dropwidget.ondragenter = function(e) {
     if (!acceptDrops)
       return;
     else if (self.eventContainsFile(e)) {
       dragState = 2;
       self.setHoverStyle(true);
     }
     e.stopPropagation();
   };

   dropwidget.ondragleave = function(e) {
     var x = e.clientX, y = e.clientY;
     var el = document.elementFromPoint(x, y);
     if (el === dropcover) {
       dragState = 1;
       return;
     }
     
     if (!acceptDrops)
       return;
     self.setHoverStyle(false);
   };

   dropwidget.ondragover = function(e) {
     e.preventDefault();
   };

   bodyDragEnter = function(e) {
     if (!bodyAware || !$(dropwidget).is(":visible"))
       return;
     
     dragState = 1;
     self.setHoverStyle(true);
   };
   document.body.addEventListener("dragenter", bodyDragEnter);

   dropcover.ondragover = function(e) {
     e.preventDefault();
     e.stopPropagation();
   }
   dropcover.ondragleave = function(e) {
     if (!acceptDrops || dragState != 1)
      return;
     self.setHoverStyle(false);
   };
   dropcover.ondrop = function(e) {
     e.preventDefault();
     if (bodyDropForward)
       dropwidget.ondrop(e);
     else
       self.setHoverStyle(false);
   }   

   dropwidget.ondrop = function(e) {
     e.preventDefault();
     if (!acceptDrops)
       return;
     
     self.setHoverStyle(false);
     if (window.FormData === undefined ||
	 e.dataTransfer.files == null ||
	 e.dataTransfer.files.length == 0)
       return;

     self.addFiles(e.dataTransfer.files);
   };

   this.addFiles = function(filesList) {
     var newKeys = [];
     for (var i=0; i < filesList.length; i++) {
       var xhr = new XMLHttpRequest();
       xhr.id = Math.floor(Math.random() * Math.pow(2, 31));
       xhr.file = filesList[i];
       
       uploads.push(xhr);
       
       var newUpload = {};
       newUpload['id'] = xhr.id;
       newUpload['filename'] = xhr.file.name;
       newUpload['type'] = xhr.file.type;
       newUpload['size'] = xhr.file.size;
       
       newKeys.push(newUpload);
     }
     
     APP.emit(dropwidget, 'dropsignal', JSON.stringify(newKeys));
   }

   dropwidget.addEventListener("click", function(e) {
     if (acceptDrops) {
       $(hiddenInput).val('');
       hiddenInput.click();
     }
   });
   
   dropwidget.markForSending = function(files) {
     for (var j=0; j < files.length; j++) {
       var id = files[j]['id'];
       for (var i=0; i < uploads.length; i++) {
	 if (uploads[i].id == id) {
	   uploads[i].ready = true;
	   break;
	 }
       }
     }

     if (!sending) {
       if (uploads[0].ready) {
	 self.requestSend();
       }
     }
   }

   this.requestSend = function() {
     if (uploads[0].skip) {
       self.uploadFinished(null);
       return;
     }
     
     sending = true;
     APP.emit(dropwidget, 'requestsend', uploads[0].id);
   }
   
   dropwidget.send = function(url) {
     xhr = uploads[0]
     if (xhr.file.size > maxFileSize) {
       APP.emit(dropwidget, 'filetoolarge', xhr.file.size);
       self.uploadFinished(null);
       return;
     } else {
       self.validFileCheck(xhr.file, self.actualSend, url);
     }
   }

   this.actualSend = function(isValid, url) {
     if (!isValid) {
       self.uploadFinished(null);
       return;
     }
       
     xhr = uploads[0]
     xhr.addEventListener("load", self.uploadFinished);
     xhr.addEventListener("error", self.uploadFinished);
     xhr.addEventListener("abort", self.uploadFinished);
     xhr.addEventListener("timeout", self.uploadFinished);
     //xhr.upload.addEventListener("error", self.uploadFinished);
     xhr.open("POST", url);

     var fd = new FormData();
     fd.append("file-id", xhr.id);
     fd.append("data", xhr.file);
     xhr.send(fd);
   }

   this.uploadFinished = function(e) {
     if (e != null &&
	 e.type == 'load' &&
	 e.currentTarget.status == 200)
       APP.emit(dropwidget, 'uploadfinished', uploads[0].id);
     uploads.splice(0,1);
     if (uploads[0] && uploads[0].ready)
       self.requestSend();
     else {
       sending = false;
       APP.emit(dropwidget, 'donesending');
     }
   }

   dropwidget.cancelUpload = function(id) {
     if (uploads[0] && uploads[0].id == id)
       uploads[0].abort();
     else {
       for (var i=1; i < uploads.length; i++) {
	 if (uploads[i].id == id) {
	   uploads[i].skip = true;
	 }
       }
     }
   };

   hiddenInput.onchange = function() {
     if (!acceptDrops)
       return;
     if (window.FormData === undefined ||
	 this.files == null ||
	 this.files.length == 0)
       return;

     self.addFiles(this.files);
   };
   
   
   this.setHoverStyle = function(enable) {
     if (enable) {
       $(dropwidget).addClass(hoverClassName);
       if (bodyAware) {
	 $(dropwidget).addClass("drag-style");
	 $(dropcover).addClass("drag-style");
       }
     } else {
       $(dropwidget).removeClass(hoverClassName);
       if (bodyAware) {
	 $(dropwidget).removeClass("drag-style");
	 $(dropcover).removeClass("drag-style");
       }
       dragState = 0;
     }
   };

   dropwidget.configureHoverClass = function(className) {
     hoverClassName = className;
   };

   dropwidget.setFilters = function(acceptAttributes) {
     hiddenInput.setAttribute('accept', acceptAttributes);
   };

   dropwidget.destructor = function() {
     document.body.removeEventListener("dragenter", bodyDragEnter);
     document.body.removeChild(dropcover);
   };

 });
