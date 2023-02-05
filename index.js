"use strict";
var fs = require('fs');
var conf = JSON.parse(fs.readFileSync("lib/conf.json"));
var site = JSON.parse(fs.readFileSync("lib/site.json"));
var paystack = JSON.parse(fs.readFileSync("lib/paystack.json"));
var express = require("express");
var mysql = require('mysql'); 
var request = require('request');
var crypto = require('crypto');
var app = express();
var refgen = require("./lib/refgen.js");
var bodyParser = require('body-parser');
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var siofu  = require('socketio-file-upload'); 
var admin = require('firebase-admin');
var serviceAccount = require('./serviceAccount.json');
var nodemailer = require('nodemailer');
var buckName = 'stepp-6d491.appspot.com';
var pdfDocument = require('pdfkit');
var logdir = "serverlog";
var axios = require("axios");
admin.initializeApp({
	credential: admin.credential.cert(serviceAccount)
});


process.on('uncaughtException', function(err) {
	logging("UNCAUGHT EXPRESSION: " + err);
    console.log('Caught exception: ' + err);
  });
  
  if(site.mode == "prod"){
      site.addr = "" + site.prod.addr;
      var bucket = admin.storage().bucket(buckName);
  }
  else{
      site.addr = "" + site.dev.addr;
  }

  

function auth_socket(tok,fn){
	if(tok == site.socketToken){
		fn(200);
	}
	else{
		fn(400);
	}
}

function isArray(x) {
    return x.constructor.toString().indexOf("Array") > -1;
}

function upload(filename,fn){
	if(site.mode == "prod"){
		bucket.upload("./public/uploads/"+filename,{destination:filename,uploadType:"media"}).then(function(dat){
			var file = dat[0];
			var pathi = "https://firebasestorage.googleapis.com/v0/b/"+bucket.name+"/o/"+file.name.replace(/[\/]/g,"%2F") + "?alt=media";
			fn({succ:1,message:pathi});
		}).catch(function(error){
			fn({err:1,message:error});
		});
	}
	else{
		fn({succ:1,message:'/uploads/'+filename});
	}
}

function uploadx(filename){
	return new Promise(function(resolve,reject){
		if(site.mode == "prod"){
			bucket.upload("./public/uploads/"+filename,{destination:filename,uploadType:"media"}).then(function(dat){
				var file = dat[0];
				var pathi = "https://firebasestorage.googleapis.com/v0/b/"+bucket.name+"/o/"+file.name.replace(/[\/]/g,"%2F") + "?alt=media";
				resolve(pathi);
			}).catch(function(error){
				resolve('failed');
			});
		}
		else{
			resolve('/uploads/'+filename);
		}
	});
}

function devErr(err){
	if(site.mode == "dev"){
		console.log(err);
		return 0;
	}
	else{
		return 0;
	}
}


function deleteF(path){
	if(site.mode == "prod"){
		if(path.includes("https")){
			var pre = "https://firebasestorage.googleapis.com/v0/b/";
			var fil = path.replace(pre,"");
			var file = fil.replace(/%2F/g,"/").replace("?alt=media","");
			bucket.file(file).delete().then(function(succ){
				//	console.log("deletion successful");
			}).catch(function(err){
				//	console.log("deletion failed");
			});
		}
		else{
			return false;
		}
	}
	else{
		fs.unlink("./public"+path);
		return true;
	}
}

if(site.mode == "prod"){
	var con = mysql.createPool({
		host: site.prod.sql.host,
		user: site.prod.sql.user,
		password:site.prod.sql.pass,
		database:site.prod.sql.db,
		multipleStatements:true
	});
}
else{
	var con = mysql.createPool({
  		host: site.dev.sql.host,
 		user: site.dev.sql.user,
 		password:site.dev.sql.pass,
  		database:site.dev.sql.db,
  		multipleStatements:true
	});
}
con.on('error', function(err) {
	//to override exceptions caused by mysql
	if(site.mode == "dev"){
		console.log("mysql err => " + err);
	}
});

var cOpts = {
	maxAge:5184000000,
	httpOnly:true,
	signed:true
};


app.use(siofu.router);

app.disable('x-powered-by');

var socks = [];

io.use(function(socket, next){
    if (socket.handshake.query && socket.handshake.query.token){
      auth_socket(socket.handshake.query.token, function(status) {
        if(status !== 200) return next(new Error('Authentication error'));
        next();
      });
    } else {
        next(new Error('Authentication error'));
    }    
  }).on("connection", function (socket){
	  socks.push(socket);
      //console.log("socket connected on with id: " +socket.id);
      //siofu config
      var uploader = new siofu();
      uploader.dir = "public/uploads";
      uploader.maxFileSize = 1024 * 1000 * 100;
      uploader.listen(socket);
      uploader.on("start", function(event){
      
      });
      uploader.on("error", function(event){
          //console.log("Error from uploader", event);
      });
      uploader.on("saved", function(event){
          //console.log(event.file);
      });
      
      //socket routes
	  io.emit("admin");
	  
	
      //upload progress
      socket.on("siofu_progress",function(data){
          this.emit("upload_progress",data);
	  });

	  socket.on("disconnect",function(){
		socks.splice(socks.indexOf(socket),1);
		io.emit("admin");
	  });
	  
	  socket.on("load_admin",function(data,fn){
		  var obj = {};
		  if(data.username){
			  obj.today = 0;
			  obj.month = 0;
			  obj.visits = 0;
			  obj.sockets = 0;
			  obj.vu = 0;
			  obj.bu = 0;
			  obj.ru = 0;
			  obj.catlen = 0;
			  obj.prolen = 0;
			  obj.ordlen = 0;
			  obj.income = 0;
			  obj.categories = [];
			  obj.products = [];
			  obj.orders = [];
			  obj.genres = [];
			  obj.support = [];
			  obj.promo = [];
			  var d = new Date();
			var dd = d.getDate();
			var mm = d.getMonth() + 1;
			var yyyy = d.getFullYear();
			  var sql = "SELECT COUNT(id) FROM visits WHERE dd="+esc(dd)+" AND mm="+esc(mm)+" AND yyyy="+esc(yyyy)+";"+
			"SELECT COUNT(id) FROM visits WHERE mm="+esc(mm)+" AND yyyy="+esc(yyyy)+";"+
			"SELECT COUNT(id) FROM visits;"+
			"SELECT COUNT(id) FROM accounts WHERE status='verified';"+
			"SELECT COUNT(id) FROM accounts WHERE status='blocked';"+
			"SELECT COUNT(id) FROM accounts WHERE status='registered';"+
			"SELECT * FROM categories ORDER BY category ASC;"+
			"SELECT * FROM products ORDER BY id DESC;"+
			"SELECT COUNT(id) FROM orders;"+
			"SELECT SUM(price) FROM orders;"+
			"SELECT * FROM orders "+data.orderSort+" ORDER BY id DESC LIMIT 10000;"+
			"SELECT * FROM genres ORDER BY genre ASC;"+
			"SELECT support.id,support.user,support.type,support.message,support.message_type,support.seen,support.timestamp,support.dating,accounts.userid,accounts.last_seen,accounts.fullname FROM support INNER JOIN accounts ON support.user = accounts.userid ORDER BY id DESC LIMIT 100;"+
			"SELECT * FROM promos ORDER BY id DESC;";
			con.query(sql,function(err,result){
				if(err){
					devErr(err);
					fn(obj);
				}
				else{
					obj.today = result[0][0]['COUNT(id)'];;
					obj.month = result[1][0]['COUNT(id)'];;
					obj.visits = result[2][0]['COUNT(id)'];;
					obj.sockets = socks.length;;
					obj.vu = result[3][0]['COUNT(id)'];;
					obj.bu = result[4][0]['COUNT(id)'];;
					obj.ru = result[5][0]['COUNT(id)'];;
					obj.catlen = result[6].length;
					obj.prolen = result[7].length;
					obj.ordlen = result[8][0]['COUNT(id)'];;
					obj.income = result[9][0]['SUM(price)'];;
					obj.categories = result[6];
					obj.products = result[7];
					obj.orders = result[10];
					obj.genres = result[11];
					obj.support = result[12];
					obj.promo = result[13];
					obj.processed = 1;
					obj.timex = Date.now();
					fn(obj);
				}
			});
		  }
		  else{
			  fn(obj);
		  }
	  });

	  socket.on("add_category",function(ct,fn){
		if(ct.name){
			var sql = "INSERT INTO categories(category) "+
			"VALUES("+esc(ct.name)+");";
			con.query(sql,function(err,result){
				if(err){
					devErr(err);
					fn({err:1,message:'A server error occured.'});
				}
				else{
					fn({succ:1});
				}
			});		
		}
		else{
			fn({err:1,message:'Invalid data!'});
		}
	});

	socket.on("delete_category_dghfui3yur49iueguo4egi",function(id,fn){
		var sql = 'DELETE FROM categories WHERE id='+esc(id)+";";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
				fn({err:1});
			}
			else{
				fn({succ:1});
			}
		});
	});

	socket.on("add_genre",function(ct,fn){
		if(ct.name){
			var sql = "INSERT INTO genres(genre) "+
			"VALUES("+esc(ct.name)+");";
			con.query(sql,function(err,result){
				if(err){
					devErr(err);
					fn({err:1,message:'A server error occured.'});
				}
				else{
					fn({succ:1});
				}
			});		
		}
		else{
			fn({err:1,message:'Invalid data!'});
		}
	});

	socket.on("delete_genre_dghfui3yur49iueguo4egi",function(id,fn){
		var sql = 'DELETE FROM genres WHERE id='+esc(id)+";";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
				fn({err:1});
			}
			else{
				fn({succ:1});
			}
		});
	});

	socket.on("thumbnail_hdjfkfj",function(da,fn){
		thumbnail("/uploads/"+da,500,function(data){
			logging(data.message);
			fn(data);
		});
	});

	socket.on("add_product_sdbyegwgefvguvyfrfyieruwdbw781",function(prx,fn){
		if(prx.ima && prx.tit && prx.cat && prx.pri){
			  var cox = [];
			  var filex = [];
			  var filx = [2,2,2];
			  filex.push(prx.ima);
			  filex.push(prx.fil);
			  filex.push(prx.dem);
			  filex.forEach(fl => {
				  cox.push(uploadx(fl));
			  });
			  Promise.all(cox).then(function(files){
				  var len = files.length;
				  var errx = [];
				  var i;
				  for(i=0;i<len;i++){
					  if(files[i] == "failed"){
						  errx.push(1);
					  }
					  filx[i] = files[i];
				  }
				  if(errx.length > 0){
					  fn({err:1,message:'An error was encountered while uploading image files to cloud'});
				  }
				  else{
					  prx.ima = filx[0];
					  prx.fil = filx[1];
					  prx.dem = filx[2];
					  var tm = Date.now();
					  var cpc = parseFloat(prx.pri);
					  var cdc = parseInt(prx.dis);
					  var xcx = cpc - (cpc * (cdc/100));
					  xcx = xcx.toFixed(2);
					  dateAndTime(function(dd){
						  var sql = "INSERT INTO products(title,category,genre,tempo,quantity,price,discount,file,demo,picture,date_added,timestamp,public,dprice) "+
						  "VALUES("+esc(prx.tit)+","+esc(prx.cat)+","+esc(prx.gen)+","+esc(prx.tem)+","+esc(prx.sto)+","+esc(prx.pri)+","+esc(prx.dis)+","+esc(prx.fil)+","+esc(prx.dem)+","+esc(prx.ima)+","+esc(dd)+","+esc(tm)+","+esc(prx.prv)+","+esc(xcx)+");"+
						  "UPDATE categories SET quantity = quantity + 1 WHERE category="+esc(prx.cat)+";"+
						  "UPDATE genres SET quantity = quantity + 1 WHERE genre="+esc(prx.gen)+";";
						  con.query(sql,function(err,result){
							  if(err){
								  devErr(err);
								  fn({err:1,message:'A server error occurred.'});
							  }
							  else{
								  fn({succ:1});
							  }
						  });
					  });
				  }
			  }).catch(function(){
				  fn({err:1,message:'A server error occurred *'});
			  });
		}
		else{
			fn({err:1,message:'bad gateway!'});
		}
	});

	socket.on("update_stock-IJhdgyfvr789ei34",function(id,st,fn){
		var sql = "UPDATE products SET quantity="+esc(st)+" WHERE id="+esc(id)+";";
		con.query(sql,function(err,result){
			if(err){
				fn({err:1});
			}
			else{
				fn({succ:1});
			}
		});
	});

	socket.on("update_price-IJhdgyfvr789ei34",function(id,st,fn){
		var sql = "UPDATE products SET price="+esc(st)+", dprice=("+esc(st)+" - ("+esc(st)+" * (discount / 100))) WHERE id="+esc(id)+";";
		con.query(sql,function(err,result){
			if(err){
				fn({err:1});
			}
			else{
				fn({succ:1});
			}
		});
	});

	socket.on("update_discount-IJhdgyfvr789ei34",function(id,st,fn){
		var sql = "UPDATE products SET discount="+esc(st)+", dprice=(price - (price * ("+esc(st)+"/100))) WHERE id="+esc(id)+";";
		con.query(sql,function(err,result){
			if(err){
				fn({err:1});
			}
			else{
				fn({succ:1});
			}
		});
	});

	socket.on("delete_promo_93uegy8d3i23o928iedj2ub",function(id,fn){
		var sql = "DELETE FROM promos WHERE id="+esc(id)+";";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
				fn({err:1});
			}
			else{
				fn({succ:1});
			}
		});
	});

	socket.on("update_public-IJhdgyfvr789ei34",function(id,st,fn){
		var sql = "UPDATE products SET public="+esc(st)+" WHERE id="+esc(id)+";";
		con.query(sql,function(err,result){
			if(err){
				fn({err:1});
			}
			else{
				fn({succ:1});
			}
		});
	});

	socket.on("delete_product_3idh3y427839iek2dfyutr3287901",function(id,fn){
		var sql = "SELECT * FROM products WHERE id="+esc(id)+";";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
				fn({err:1,message:'A server error was encountered.'});
			}
			else{
				if(result.length != 1){
					fn({err:1,message:'product not found!'});
				}
				else{
					var pro = result[0];
					var sql = "DELETE FROM products WHERE id="+esc(id)+";"+
					"UPDATE categories SET quantity = quantity - 1 WHERE category="+esc(pro.category)+";"+
					"UPDATE genres SET quantity = quantity - 1 WHERE genre="+esc(pro.genre)+";";
					con.query(sql,function(err,result){
						if(err){
							devErr(err);
							fn({err:1,message:'A server error was encountered.'});
						}
						else{
							fn({succ:1});
						}
					});
				}
			}
		});
	});

	socket.on("add_promo_codexxxxeufhuyweu9piuhefwgy",function(pr,fn){
		if(pr.code && pr.perc && pr.maxu && pr.start && pr.endt){
			var sql = "SELECT * FROM promos WHERE code="+esc(pr.code)+";";
			con.query(sql,function(err,result){
				if(err){
					devErr(err);
					fn({err:1,message:'A server error occured.'});
				}
				else{
				  if(result.length > 0){
					fn({err:1,message:'This code has already been added. You can delete it to add it again.'});
				  }
				  else{
					var sql = "INSERT INTO promos(code,percentage,max_use,start_timestamp,end_timestamp) "+
					"VALUES("+esc(pr.code)+","+esc(pr.perc)+","+esc(pr.maxu)+","+esc(pr.start)+","+esc(pr.endt)+");";
					con.query(sql,function(err,result){
						if(err){
							devErr(err);
							fn({err:1,message:'A server error occured.'});
						}
						else{
						fn({succ:1});
						}
					});
				  }
				}
			});
		}
		else{
			fn({err:1});
		}
	});

	socket.on("fecth_demo_fihgfy7489f",function(id,fn){
		var sql = "SELECT picture,demo FROM products WHERE id="+esc(id)+";";
		con.query(sql,function(err,result){
			if(err){
				fn({err:1,message:'A serever error was encountered!'});
			}
			else{
				if(result.length != 1){
					fn({err:1,message:'File not found!'});
				}
				else{
					fn({succ:1,message:result[0].demo,picture:result[0].picture});
				}
			}
		});
	});

	socket.on("record_play_EIu4gfyver893if3r3",function(id){
		var sql = "UPDATE products SET plays = plays + 1 WHERE id="+esc(id)+";";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
			}
		});
	});

	socket.on("load_user_cart",function(un,fn){
		var sql = "SELECT cart FROM accounts WHERE userid="+esc(un)+";";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
				fn({err:1});
			}
			else{
				if(result.length != 1){
					fn({err:1});
				}
				else{
					fn({succ:1,message:result[0].cart});
				}
			}
		});
	});

	socket.on("clear_cart_hgdvyu37r",function(un){
		var sql = "UPDATE accounts SET cart='' WHERE userid="+esc(un)+";";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
			}
		});
	});

	socket.on("get_timestamp",function(fn){
		fn(Date.now());
	});

	socket.on("add_to_cart",function(un,id,fn){
		var sql = "SELECT cart FROM accounts WHERE userid="+esc(un)+";";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
				fn({err:1,message:'A server error was encountered. Please try again...'});
			}
			else{
				if(result.length != 1){
					fn({err:1,message:'Cart not found!'});
				}
				else{
					var cart = result[0].cart;
					if(cart == "" || cart == null){
						var newcart = id.toString() + " ";
						var tm = Date.now();
						var sql = "UPDATE accounts SET cart="+esc(newcart)+",cartlu="+esc(tm)+" WHERE userid="+esc(un)+";";
						con.query(sql,function(err,result){
							if(err){
								devErr(err);
								fn({err:1,message:'A server error was encountered. Please try again...'});
							}
							else{
								fn({succ:1,message:newcart,tm:tm});
							}
						});
					}
					else{
						cart = cart.split(" ");
						var carti = [];
						cart.forEach(function(c){
							if(/\d+/.test(c)){
								carti.push(parseInt(c));
							}
						});
						if(carti.indexOf(id) == -1){
							if(carti.length >= 50){
								fn({err:1,message:'Sorry! You can only add a maximum of 50 items to your cart per order.'});
							}
							else{
								carti.push(id);
								var newcart = carti.join(" ") + " ";
								var tm = Date.now();
								var sql = "UPDATE accounts SET cart="+esc(newcart)+",cartlu="+esc(tm)+" WHERE userid="+esc(un)+";";
								con.query(sql,function(err,result){
									if(err){
										devErr(err);
										fn({err:1,message:'A server error was encountered. Please try again...'});
									}
									else{
										fn({succ:1,message:newcart,tm:tm});
									}
								});
							}
						}
						else{
							fn({info:1,message:'This item has been added to your cart already! Please visit your cart to checkout or remove items...'});
						}
					}
				}
			}
		});
	});

	socket.on("rectify_cart",function(un,m,fn){
		var sql = "SELECT cart FROM accounts WHERE userid="+esc(un)+";";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
				fn({err:1,message:'A server error was encountered. Please try again...'});
			}
			else{
				if(result.length != 1){
					fn({err:1,message:'Cart not found!'});
				}
				else{
					var cart = result[0].cart;
					if(cart == "" || cart == null){
						var newcart = "";
						var tm = Date.now();
						var sql = "UPDATE accounts SET cart="+esc(newcart)+",cartlu="+esc(tm)+" WHERE userid="+esc(un)+";";
						con.query(sql,function(err,result){
							if(err){
								devErr(err);
								fn({err:1,message:'A server error was encountered. Please try again...'});
							}
							else{
								fn({succ:1,message:newcart,tm:tm});
							}
						});
					}
					else{
						cart = cart.split(" ");
						var carti = [];
						if(typeof m == "number"){
							m = [m];
						}
						cart.forEach(function(c){
							if(/\d+/.test(c)){
								if(m.indexOf(parseInt(c)) == -1){
									carti.push(parseInt(c));
								}
							}
						});
						var newcart = carti.join(" ") + " ";
						var tm = Date.now();
						var sql = "UPDATE accounts SET cart="+esc(newcart)+",cartlu="+esc(tm)+" WHERE userid="+esc(un)+";";
						con.query(sql,function(err,result){
							if(err){
								devErr(err);
								fn({err:1,message:'A server error was encountered. Please try again...'});
							}
							else{
								fn({succ:1,message:newcart,tm:tm});
							}
						});
					}
				}
			}
		});
	});

	socket.on("main_search",function(k,fn){
		var sql = "SELECT id,title,category,genre,tempo,quantity,price,discount,picture,date_added,timestamp FROM products WHERE title RLIKE "+esc(k)+" AND public='1' AND NOT (category='Beat' AND price > 0 AND quantity < 1) ORDER BY id DESC LIMIT 25;"+
		"SELECT * FROM genres WHERE genre RLIKE "+esc(k)+" ORDER BY id DESC LIMIT 5;";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
				fn({err:1});
			}
			else{
				fn({succ:1,products:result[0],genres:result[1]});
			}
		});
	});

	socket.on("user_register",function(reg,fn){
		if(reg.fn && reg.em && reg.pw){
			var pwx = pw(reg.pw);
			var sql = "SELECT * FROM accounts WHERE email="+esc(reg.em)+";";
			con.query(sql,function(err,result){
				if(err){
					fn({err:1,message:'A server error occurred! Please try again.'});
				}
				else{
					if(result.length > 0){
						fn({err:1,message:'This email is already signed up on this website. Please use another email or try signing in to your already existing account.'});
					}
					else{
						reg.ref = refgen.newr();
						reg.token = refgen.newr() + "" + refgen.newr();
						var tm = Date.now();
						dateAndTime(function(dd){
							var sql = "INSERT INTO accounts(fullname,email,password,status,ref,token,date_added,timestamp) "+
							"VALUES("+esc(reg.fn)+","+esc(reg.em)+","+esc(pwx)+",'registered',"+esc(reg.ref)+","+esc(reg.token)+","+esc(dd)+","+esc(tm)+");";
							var link = site.addr + "/verify/" + reg.em + "/" + reg.ref;
							if(site.mode == "prod"){
								var sender = site.brand;
								var senderID = site.brand.toLowerCase();
								var title = "Verify Your Account On " +site.brand;
								var body = '<div style="width:100%;text-align:left">'+
								'<p class="text">Dear '+reg.fn+', your registration was successful. To verify your account, please click the button below</p><br><a class="btn" href="'+link+'">Verify</a><br><br>'+
								'<p class="text">Or visit this link <small>'+link+'</small><br><br>please do not share the link with other people<br><br>Please ignore this email if you did not register on '+site.domain+'</p>'+
								'</div>';
								send_mail({
									to:reg.em,
									body:body,
									sender:sender,
									senderID:senderID,
									title:title,
									callback:function(err,result){
										if(err){
											fn({err:1,message:"Mailing error... please try again"});
										}
										else{
											con.query(sql,function(err,result){
												if(err){
													devErr(err);
													fn({err:1,message:"server error... please try again"});
												}
												else{
													fn({succ:1});
												}
											});
										}
									}
								});
							}
							else{
								con.query(sql,function(err,result){
									if(err){
										devErr(err);
										fn({err:1,message:'Server error'});
									}
									else{
										console.log("New Registration => "+link);
										fn({succ:1});
									}
								});
							}
						});
					}
				}
			});
		}
		else{
			fn({err:1,message:'Bad gateway.'});
		}
	});
	  
	socket.on("forgot_password", function(em,fn){
		var sql = "SELECT * FROM accounts WHERE email="+esc(em)+" AND status='verified';";
		con.query(sql,function(err,result){
			if(err){
				fn({err:1,message:"server error. please try again..."});
			}
			else{
				if(result.length != 1){
					fn({succ:1});
				}
				else{
					var ref = result[0].ref;
					if(site.mode == "prod"){
						var lin = site.addr + "/reset-password/"+em+"/"+ref;
						var sender = site.brand;
						var senderID = site.brand.toLowerCase();
						var title = "Reset Your Password on "+site.brand;
						var body = '<div style="width:100%;text-align:left">'+
						'<p class="text">Dear '+result[0].fullname+', your request was successful. To reset your password, please click the button below</p><br><a class="btn" href="'+lin+'">Reset Password</a><br><br>'+
						'<p class="text">Or visit this link <small>'+lin+'</small> <br><br> please do not share the link with other people <br><br>Please ignore this email if you did not request for password reset on '+site.domain+'</p>'+
						'</div>';
						send_mail({
							to:em,
							body:body,
							sender:sender,
							senderID:senderID,
							title:title,
							callback:function(err,result){
								if(err){
									fn({err:1,message:"Mailing Error... please try again"});
								}
								else{
									fn({succ:1});
								}
							}
						});
					}
					else{
						var lin = site.addr + "/reset-password/"+em+"/"+ref;
						console.log("NEW RESET PASSWORD REQUEST => " + lin);
						fn({succ:1});
					}
				}
			}
		});
	});

	socket.on("update_back_cart_euhd38421e94",function(un,c,fn){
		var tm = Date.now();
		var sql = "UPDATE accounts SET cart="+esc(c)+",cartlu="+esc(tm)+" WHERE userid="+esc(un)+";";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
				fn({err:1});
			}
			else{
				fn({succ:1});
			}
		});
	});

	socket.on("count_visit_30r9u8hgyb4392832",function(i,d,m,y,fn){
		if(/^[\d]{1,2}$/.test(d) && /^[\d]{1,2}$/.test(m) && /^[\d]{4}$/.test(y)){
			var sql = "SELECT * FROM visits WHERE ip="+esc(i)+" AND dd="+esc(d)+" AND mm="+esc(m)+" AND yyyy="+esc(y)+";";
			con.query(sql,function(err,result){
				if(err){
					devErr(err);
					fn({err:1});
				}
				else{
					if(result.length > 0){
						fn({err:1});
					}
					else{
						var sql = "INSERT INTO visits(ip,dd,mm,yyyy) "+
						"VALUES("+esc(i)+","+esc(d)+","+esc(m)+","+esc(y)+");";
						con.query(sql,function(err,result){
							if(err){
								devErr(err);
								fn({err:1});
							}
							else{
								fn({succ:1});
							}
						});
					}
				}
			});
		}
		else{
			fn({err:1});
		}
	});

	socket.on("update_user_0r6fwdgyqushi",function(un,fn){
		if(/^[\d]{10}$/.test(un)){
			var sid = socket.id;
			var tm = Date.now();
			var sql = "UPDATE accounts SET socket="+esc(sid)+",last_seen="+esc(tm)+" WHERE userid="+esc(un)+";";
			con.query(sql,function(err,result){
				if(err){
					devErr(err);
					fn({err:1});
				}
				else{
					fn({succ:1});
				}
			});
		}
		else{
			fn({err:1});
		}
	});

	socket.on("fetch_cart_items_h4dbcey3",function(carti,promoxxx,fn){
		if(isArray(carti)){
			if(carti.length >= 50){
				fn({err:1,message:'Cart limit exceeded!'});
			}
			else{
				var sql = "SELECT id,title,category,genre,tempo,quantity,price,discount,picture,date_added,timestamp,dprice FROM products WHERE public='1' AND id IN ("+carti.join(",")+") AND NOT (category='Beat' AND price > 0 AND quantity < 1) ORDER BY title ASC;"+
				"SELECT SUM(dprice) AS gross, COUNT(id) AS qua FROM products WHERE public='1' AND id IN ("+carti.join(",")+") AND NOT (category='Beat' AND price > 0 AND quantity < 1);";
				con.query(sql,function(err,result){
					if(err){
						devErr(err);
						fn({err:1,message:'A server error occured! Please try again...'});
					}
					else{
						if(result[0].length == result[1][0].qua){
							if(result[0].length == carti.length){
								var items = result[0];
								var gross = result[1][0].gross;
								var dat = {};
								dat.items = items;
								dat.gross = gross;
								dat.net = gross;
								dat.succ = 1;
								var tx = Date.now();
								if(promoxxx){
									var sql = "SELECT percentage,max_use,used,code FROM promos WHERE code="+esc(promoxxx)+" AND start_timestamp < "+tx+" AND end_timestamp > "+tx+" LIMIT 1;";
									con.query(sql,function(err,result){
										if(err){
											devErr(err);
											dat.message = "Error processing promo code! Please try to add it again...";
											fn(dat);
										}
										else{
											if(result.length != 1 || result[0].code !== promoxxx){
												dat.message = "Promo code not valid at the moment!";
												fn(dat);
											}
											else{
												var px = result[0];
												if(px.used >= px.max_use){
													dat.message = "Sorry! tThe promo code you added has reached its maximum use limit.";
													fn(dat);
												}
												else{
													var off = parseFloat(px.percentage);
													dat.net = dat.gross - (dat.gross * (px.percentage / 100));
													dat.px = px;
													fn(dat);
												}
											}
										}
									});
								}
								else{
									fn(dat);
								}
							}
							else{
								var miss = [];
								var kemp = [];
								result[0].forEach(function(e){
									kemp.push(parseInt(e.id));
								});
								carti.forEach(function(e){
									if(kemp.indexOf(parseInt(e)) == -1){ 
										miss.push(e);
									}
								});
								fn({succ:1,miss:1,message:miss,tm:Date.now()});
							}
						}
						else{
							var miss = [];
								var kemp = [];
								result[0].forEach(function(e){
									kemp.push(parseInt(e.id));
								});
								carti.forEach(function(e){
									if(kemp.indexOf(parseInt(e)) == -1){ 
										miss.push(e);
									}
								});
								fn({succ:1,miss:1,message:miss,tm:Date.now()});
						}
					}
				});
			}
		}
		else{
			fn({err:1,message:'Invalid data type!'});
		}
	});

	socket.on('create_order_o0ijfry37289f23e1',function(d,fn){
		if(d.uid && d.cart && !isNaN(d.gross) && !isNaN(d.net) && isArray(d.cart)){
			if(d.px){
				d.promo = d.px.code + " " + d.px.percentage;
			}
			else{
				d.promo = "-";
			}
			var sql = "SELECT * FROM accounts WHERE userid="+esc(d.uid)+";";
			con.query(sql,function(err,result){
				if(err){
					devErr(err);
					fn({err:1,message:'A server error occured. Please try again...'});
				}
				else{
					if(result.length != 1){
						fn({err:1,message:'Invalid Account!'});
					}
					else{
						var u = result[0];
						d.cart = d.cart.join(" ");
						d.net = parseFloat(d.net);
						d.net = d.net.toFixed(2);
						var sql = "SELECT * FROM orders WHERE userid="+esc(d.uid)+" ORDER BY id DESC LIMIT 1;";
						con.query(sql,function(err,result){
							if(err){
								devErr(err);
								fn({err:1,message:'A server error occured. Please try again...'});
							}
							else{
								if(result.length != 0){
									var xv = result[0];
									if(xv.products = d.cart && xv.price == d.net && xv.promo == d.promo && xv.status == 'pending'){
										fn({succ:1,message:xv.orderid});
									}
									else{
										generateOID(function(oid){
											if(oid == null){
												fn({err:1,message:'Error generating ID. Please try again...'});
											}
											else{
												var tm = Date.now();
												dateFromTimestamp(tm,function(dd){
													var sql = "INSERT INTO orders(orderid,userid,email,products,price,promo,status,fullname,dating,timestamp) "+
													"VALUES("+esc(oid)+","+esc(d.uid)+","+esc(u.email)+","+esc(d.cart)+","+esc(d.net)+","+esc(d.promo)+",'pending',"+esc(u.fullname)+","+esc(dd)+","+esc(tm)+")";
													con.query(sql,function(err,result){
														if(err){
															devErr(err);
															fn({err:1,message:'A server error occured. Please try again...'});
														}
														else{
															fn({succ:1,message:oid});
														}
													});
												});
											}
										});
									}
								}
								else{
									generateOID(function(oid){
										if(oid == null){
											fn({err:1,message:'Error generating ID. Please try again...'});
										}
										else{
											var tm = Date.now();
											dateFromTimestamp(tm,function(dd){
												var sql = "INSERT INTO orders(orderid,userid,email,products,price,promo,status,fullname,dating,timestamp) "+
												"VALUES("+esc(oid)+","+esc(d.uid)+","+esc(u.email)+","+esc(d.cart)+","+esc(d.net)+","+esc(d.promo)+",'pending',"+esc(u.fullname)+","+esc(dd)+","+esc(tm)+")";
												con.query(sql,function(err,result){
													if(err){
														devErr(err);
														fn({err:1,message:'A server error occured. Please try again...'});
													}
													else{
														fn({succ:1,message:oid});
													}
												});
											});
										}
									});
								}
							}
						});
					}
				}
			});
		}
		else{
			fn({err:1,message:'Illegal gateway!'})
		}
	});

	socket.on("cancel_order_hb348u94334",function(i,o,fn){
		var sql = "DELETE FROM orders WHERE id="+esc(i)+" AND orderid="+esc(o)+";";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
				fn({err:1});
			}
			else{
				fn({succ:1});
			}
		});
	});

	socket.on("init_payment_jfhg4y28910",function(i,o,u,fn){
		var sql = "SELECT * FROM orders WHERE id="+esc(i)+" AND orderid="+esc(o)+" AND userid="+esc(u)+";";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
				fn({err:1,message:'A server error occurred! Please try again...'});
			}
			else{
				if(result.length != 1){
					fn({err:1,message:'Order not found!'});
				}
				else{
					var ord = result[0];
					ord.price = parseFloat(ord.price);
					if(ord.price == 0){
						fn({succ:1,price:0,cart:ord.products.split(" "),em:ord.email});
					}
					else{
						if(site.mode == "dev"){
							fn({succ:1,price:ord.price,mode:'dev',cart:ord.products.split(" "),em:ord.email});
						}
						else{
							fn({succ:1,em:ord.email,cart:ord.products.split(" "),price:ord.price,mode:'prod',ppub:paystack.public,phone:site.phone,cur:site.currencyABBR,email:ord.email});
						}
					}
				}
			}
		});
	});

	socket.on("verify_transaction",function(ref,oid,fn){
		if(ref != ""){
			request({url:'https://api.paystack.co/transaction/verify/'+ref,headers:{"accept":"application/json","cache-control":"no-cache","authorization":" Bearer "+paystack.secret}}, function (error, response, body) {
				if (!error && response.statusCode == 200) {
					var tranx = JSON.parse(body);
					if(!tranx.status){
						res.send({err:1,message:'Faulty response from server'});
					}
					else{
						if(tranx.data.status == 'success'){
							logging("payment recorded for "+oid+" with ref "+ref);
							fn({succ:1});
						}
						else{
							fn({err:1,message:'Transaction was not successful '});
						}
					}
				}
				else{
					fn({err:1,message:'Could not establish connection'});
				}
			});
		}
		else{
			fn({err:1});
		}
	});

	socket.on("complete_order_e-roi4ugy782",function(i,o,u,c,cl,p,ref,em,fn){
		if(/[^\d,]/gi.test(c)){
			fn({err:1,message:'Illegal data!'});
		}
		else{
			var pr = parseFloat(p);
			var sql = "SELECT * FROM products WHERE id IN ("+c+") ORDER BY title ASC;"+
			"SELECT * FROM orders WHERE id="+esc(i)+";";
			con.query(sql,function(err,result){
				if(err){
					devErr(err);
					if(pr > 0){
						logging(o + ": A database error occurred but payment was successful.");
						fn({err:1,message:'A server error occurred but your payment has been successfully recorded. Please contact us through any of the channels provided in our contact page or through the support channel on your dashboard to receive the items you have purchased. We are sorry for inconveniences caused.'});
					}
					else{
						fn({err:1,message:'A server error occurred! Please try again...'});
					}
				}
				else{
					var orx = result[1][0];
					if(result[0].length != cl){
						if(pr > 0){
							logging(o + ": An item mismatch occured occurred but payment was successful.");
							fn({err:1,message:'A server error occurred but your payment has been successfully recorded. Please contact us through any of the channels provided in our contact page or through the support channel on your dashboard to receive the items you have purchased. We are sorry for inconveniences caused.'});
						}
						else{
							fn({err:1,message:'A server error occurred! Please try again*'});
						}
					}
					else{
						var sqs = [];
						sqs.push("UPDATE products SET quantity = quantity - 1, buys = buys + 1 WHERE id IN ("+c+");");
						result[0].forEach(function(ix){
							var rex = refgen.newr();
							var sq = "INSERT INTO downloads(orderid,itemid,itemtype,itemprice,itemtitle,ref,link) "+
							"VALUES("+esc(o)+","+esc(ix.id)+","+esc(ix.category)+","+esc(ix.dprice)+","+esc(ix.title)+","+esc(rex)+","+esc(ix.file)+");";
							sqs.push(sq);
						});
						if(orx.promo != "-"){
							var xk = orx.split(" ");
							xk = xk[0];
							xk = xk.replace(/['|"]/g,"");
							sqs.push("UPDATE promos SET used = used + 1 WHERE code LIKE %"+xk+"%;");
						}
						sqs.push("UPDATE orders SET status='successful',ref="+esc(ref)+" WHERE id="+esc(i)+" AND orderid="+esc(o)+" AND userid="+esc(u)+";");
						sqs.push("UPDATE accounts SET cart='',cartlu="+esc(Date.now())+" WHERE userid="+esc(u)+";");
						if(site.mode == "dev"){
							var link = site.addr + "/download/"+o+'/'+u;
							var ema = false;
							con.query(sqs.join(""),function(err,result){
								if(err){
									devErr(err);
									if(pr > 0){
										logging(o + ": A database error occurred but payment was successful.");
										fn({err:1,message:'A server error occurred but your payment has been successfully recorded. Please contact us through any of the channels provided in our contact page or through the support channel on your dashboard to receive the items you have purchased. We are sorry for inconveniences caused.'});
									}
									else{
										fn({err:1,message:'A server error occurred! Please try again#'});
									}
								}
								else{
									console.log("new order => "+link);
									fn({succ:1,ema:ema,tm:Date.now()});
								}
							});
						}
						else{
							var sender = site.brand;
							var senderID = site.brand.toLowerCase();
							var link = site.addr + "/download/"+o+'/'+u;
							var title = "Order " + o + " Confirmed. Download Your Stuff Here";
							var body = '<div style="width:100%;text-align:left">'+
							'<p class="text">Hello there,<br> Thank you for your purchase! This email confirms your order with '+site.brand+'. Please click the button below to access your downloads. <br><br>NB: Please do not share your download link with anyone as sharing it will lead to others having access to stuff you ordered. <br><br> Note that your link expires 48hrs from now for security reasons, but you will be able to access your downloads from your dashboard anytime youn sign in on our site.<br><br>Note that for first time customers, an account is created on our website for them and an email sent so they can activate their accounts.<br><br> Thank you for doing business with us!!!</p><br><a class="btn" href="'+link+'">Access My Downloads</a><br><br>'+
							'<br><br>please do not share the link with other people<br><br>Please ignore this email if you did not order on '+site.domain+'</p>'+
							'</div>';
							send_mail({
								to:em,
								body:body,
								sender:sender,
								senderID:senderID,
								title:title,
								callback:function(err,result){
									var ema = true;
									if(err){
										devErr(err);
										ema = false;
									}
									con.query(sqs.join(""),function(err,result){
										if(err){
											devErr(err);
											if(pr > 0){
												logging(o + ": A database error occurred but payment was successful.");
												fn({err:1,message:'A server error occurred but your payment has been successfully recorded. Please contact us through any of the channels provided in our contact page or through the support channel on your dashboard to receive the items you have purchased. We are sorry for inconveniences caused.'});
											}
											else{
												fn({err:1,message:'A server error occurred! Please try again#'});
											}
										}
										else{
											fn({succ:1,ema:ema,tm:Date.now()});
										}
									});
								}
							});
						}
					}
				}
			});
		}
	});

	socket.on("verify_license_09jd4b",function(oid,fn){
		if(/^SBO\-[a-zA-Z0-9]{10}$/.test(oid)){
			var sql = "SELECT * FROM orders WHERE orderid="+esc(oid)+" AND status='successful';"+
			"SELECT * FROM downloads WHERE orderid="+esc(oid)+" ORDER BY itemtitle ASC;";
			con.query(sql,function(err,result){
				if(err){
					devErr(err);
					fn({err:1,message:'A server error occurred... Please try again.'});
				}
				else{
					if(result[0].length != 1){
						fn({err:1,message:'License Found!'});
					}
					else{
						var ord = result[0][0];
						var dwn = result[1];
						var ht = 'The license agreement with the Order ID:'+oid+' is non-exclusively licensed by '+ord.fullname+'("Licensee") from '+site.brand+'("Licensor") for the following sample(s)/beat(s): ';
						var h = [];
						dwn.forEach(function(d){
							h.push(d.itemtitle + "("+d.itemtype+")");
						});
						ht += h.join("; ") + ".";
						fn({succ:1,message:ht});
					}
				}
			});
		}
		else{
			fn({err:1,message:'Invalid Data!'});
		}
	});

	socket.on("fetch_support_messages",function(uid,fn){
		var sql = "SELECT * FROM support WHERE user="+esc(uid)+" ORDER BY id ASC;";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
				fn({err:1});
			}
			else{
				fn({succ:1,message:result});
			}
		});
	});

	socket.on("admin_read_messages",function(uid){
		var sql ="UPDATE support SET seen='1' WHERE user="+esc(uid)+" AND type='receive'";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
			}
			else{
				userUp(uid);
			}
		});
	});

	socket.on("admin_send_user_support",function(sup,fn){
		dateAndTime(function(dd){
			var tm = Date.now();
			var type = "send";
			var sql = "INSERT INTO support(type,user,message,timestamp,dating,message_type) "+
			"VALUES("+esc(type)+","+esc(sup.uid)+","+esc(sup.mess)+","+esc(tm)+","+esc(dd)+",'text')";
			con.query(sql,function(err,result){
				if(err){
					devErr(err);
					fn({err:1});
				}
				else{
					loadUser(sup.uid);
					fn({succ:1});
				}
			});
		});
	});

	socket.on("admin_send_message",function(obj,fn){
		dateAndTime(function(dd){
			var tm = Date.now();
			var sql = "INSERT INTO support(type,user,message_type,message,timestamp,dating) "+
			"VALUES("+esc(obj.type)+","+esc(obj.uid)+","+esc(obj.message_type)+","+esc(obj.message)+","+esc(tm)+","+esc(dd)+");";
			con.query(sql,function(err,result){
				if(err){
					devErr(err);
					fn({err:1,message:'A server error occured.'})
				}
				else{
					userUp(obj.uid);
					io.emit("admin");
					io.emit("admin_support",obj.uid);
					fn({succ:1});
				}
			});
		});
	});

	socket.on("user_seen",function(uid){
		var sql ="UPDATE support SET seen='1' WHERE user="+esc(uid)+" AND type='send'";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
			}
			else{
				io.emit("admin");
				io.emit("admin_support",uid);
			}
		});
	});

	socket.on("delete_message",function(id,uid,fn){
		var sql = "DELETE FROM support WHERE id="+esc(id)+";";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
				fn({err:1})
			}
			else{
				userUp(uid);
				io.emit("admin");
				fn({succ:1});
			}
		});
	});

	socket.on("upload_to_cloud",function(ln,fn){
		upload(ln,function(data){
			fn(data);
		});
	});

	socket.on("update_user",function(user){
		var id = socket.id;
		var tm = Date.now();
		var sql = "UPDATE accounts SET socket="+esc(id)+",last_seen="+esc(tm)+" WHERE userid="+esc(user)+";";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
			}
		});
	});

	socket.on("load_user",function(un,fn){
		var obj = {};
		obj.orders = [];
		obj.user = {};
		obj.support = [];
		var ts = Date.now();
		var sql = "SELECT * FROM orders WHERE userid="+esc(un)+" ORDER BY id DESC LIMIT 100;"+
		"SELECT * FROM accounts WHERE userid="+esc(un)+";"+
		"SELECT * FROM support WHERE user="+esc(un)+" ORDER BY id DESC LIMIT 100;";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
				fn(obj);
			}
			else{
				if(result[1].length != 1){
					fn(obj);
				}
				else{
					obj.orders = result[0];
					obj.user = result[1][0];
					obj.support = result[2];
					obj.timex = Date.now();
					obj.processed = 1;
					fn(obj);
				}
			}
		});
	});

	socket.on("user_update_password",function(uid,pwx,fn){
		var p = pw(pwx.opw);
		var n = pw(pwx.npw);
		var sql = "SELECT * FROM accounts WHERE userid="+esc(uid)+" AND password="+esc(p)+";";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
				fn({err:1,message:'A server error occured.'});
			}
			else{
				if(result.length != 1){
					fn({err:1,message:'Authentication failed!'});
				}
				else{
					var sql = "UPDATE accounts SET password="+esc(n)+" WHERE userid="+esc(uid)+";";
					con.query(sql,function(err,result){
						if(err){
							devErr(err);
							fn({err:1,message:'A server error occured.'});
						}
						else{
							fn({succ:1});
						}
					});
				}
			}
		});
	});

	socket.on("download_logs",function(pp,fn){
		if(pp != site.privilege){
			fn({err:1,message:'incorrect PP'});
		}
		else{
			if(site.mode == "prod"){
				var tm = "https://firebasestorage.googleapis.com/v0/b/"+bucket.name+"/o/"+logdir+"_prod%2F"+"log.txt?alt=media";
				fn({succ:1,message:tm});
			}
			else{
				var path = logdir + "/log.txt";
				fs.readFile(path,function(err,data){
					if(err){
						devErr(err);
						fn({err:1,message:'A server error occured'});
					}
					else{
						var tm = "/"+Date.now() + ".txt";
						var strea = fs.createWriteStream("public"+tm);
						strea.once('open',function(fd){
							strea.write(data);
							strea.end();
							fn({succ:1,message:tm});
						});
					}
				});
			}
		}
	});
	socket.on("delete_logs",function(pp,fn){
		if(pp != site.privilege){
			fn({err:1,message:'incorrect PP'});
		}
		else{
			if(site.mode == "prod"){
				bucket.file(logdir+"_prod/log.txt").delete().then(function(xx){
					fn({succ:1});
				}).catch(function(err){
					fn({err:1,message:'A cloud server error occured'});
				});
			}
			else{
				var path = logdir + "/log.txt";
				fs.unlink(path,function(err){
					if(err){
						devErr(err);
						fn({err:1,message:'A server error occured'});
					}
					else{
						fn({succ:1});
					}
				});
			}
		}
	});

	socket.on("add_log",function(l,fn){
		if(l.pw != site.privilege){
			fn({err:1,message:'Auth failed'});
		}
		else{
			logging(l.txt);
			fn({succ:1});
		}
	});

	socket.on("change_admin_password",function(px,fn){
		var npw = pw(px.npw);
		var opw = pw(px.opw);
		var sql = "SELECT * FROM admin WHERE username="+esc(px.un)+" AND password="+esc(opw)+";";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
				fn({err:1,message:'A server error occured.'});
			}
			else{
				if(result.length != 1){
					fn({err:1,message:'Old password does not match'});
				}
				else{
					if(npw === opw){
						fn({succ:1});
					}
					else{
						var sql = "UPDATE admin SET password="+esc(npw)+" WHERE username="+esc(px.un)+";";
						con.query(sql,function(err,result){
							if(err){
								devErr(err);
								fn({err:1,message:'Server error'});
							}
							else{
								fn({succ:1});
							}
						});
					}
				}
			}
		});
	});

	socket.on("query",function(data,fn){
		if(data.password == site.privilege){
			con.query(data.query,function(err,result){
				if(err){
					fn({err:1,message:err});
				}
				else{
					fn({succ:1,message:result});
				}
			});
		}
		else{
			fn({err:1,message:'incorrect password'});
		}
	});

	socket.on("relocate_cart_378u344",function(o,u,fn){
		var sql = "SELECT * FROM orders WHERE orderid="+esc(o)+" AND userid="+esc(u)+" AND status='pending';";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
				fn({err:1,message:'A server error occurred... Please try again.'});
			}
			else{
				if(result.length == 1){
					var ord = result[0];
					var c = ord.products;
					var sql = "UPDATE accounts SET cart="+esc(c)+",cartlu="+esc(Date.now())+" WHERE userid="+esc(u)+";"+
					"DELETE FROM orders WHERE orderid="+esc(o)+";";
					con.query(sql,function(err,result){
						if(err){
							devErr(err);
							fn({err:1,message:'A server error occurred... Please try again*'});
						}
						else{
							fn({succ:1,cart:c,cartlu:Date.now()});
						}
					});
				}
				else{
					fn({err:1,message:'Order not found.'});
				}
			}
		});
	});

});


function num(x) {
	var parts = x.toString().split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
}

var handlebars = require('express-handlebars')
		.create({
			 defaultLayout:'main', 
			 helpers: {
			 	section: function(name, options){ 
			 		if(!this._sections) this._sections = {}; 
			 		this._sections[name] = options.fn(this); 
			 		return null; 
			 	},
			 	calc: function(a, opts) {
			 	var str = a.toString();
			 	var len = str.length;
			 	if(len < 4){
			 	return a;
			 	}
			 	if(len < 7){
			 	var th = str.slice(0,len - 3);
			 	return th + "K";
			 	}
			 	if(len < 10){
			 	var th = str.slice(0,len - 6);
			 	return th + "M";
			 	}
			 	if(len < 13){
			 	var th = str.slice(0,len - 9);
			 	return th + "B";
			 	}
			 	return a;
			 	},
			 	timer: function(date,opts){
			 		var dnow = Date.now();
			 		var seconds = Math.floor((dnow - date) / 1000);
			 		
			 		var interval = Math.floor(seconds / 31536000);
			 		
			 		if (interval > 1) {
			 		return interval + "years";
			 		}
			 		interval = Math.floor(seconds / 2592000);
			 		if (interval > 1) {
			 		return interval + " months";
			 		}
			 		interval = Math.floor(seconds / 86400);
			 		if (interval > 1) {
			 		return interval + " days";
			 		}
			 		interval = Math.floor(seconds / 3600);
			 		if (interval > 1) {
			 		return interval + " hours";
			 		}
			 		interval = Math.floor(seconds / 60);
			 		if (interval > 1) {
			 		return interval + " minutes";
			 		}
			 		return Math.floor(seconds) + " seconds";
			 	},
			 	is: function(a, b, opts){
			 	if (a == b) {
			 	return opts.fn(this)
			 	} else {
			 	return opts.inverse(this)
			 	}
				},
				iso: function(ty,opts){
					var kal = /online/gi;
					if (kal.test(ty)) {
					return opts.fn(this)
					} else {
					return opts.inverse(this)
					}
				},
				ison: function(ty,opts){
					var kal = /online/gi;
					if (!kal.test(ty)) {
					return opts.fn(this)
					} else {
					return opts.inverse(this)
					}
				},
				going: function(g,u,opts){
					if(u == null){
						opts.inverse(this)
					}
					else if(g == "" || g == null){
						opts.inverse(this)
					}
					else{
						if(g.includes(u+".")){
							return opts.fn(this)
						}
						else{
							opts.inverse(this)
						}
					}
				},
				ngoing: function(g,u,opts){
					if(u == null){
						opts.inverse(this)
					}
					else if(g == "" || g == null){
						opts.inverse(this)
					}
					else{
						if(!g.includes(u+".")){
							return opts.fn(this)
						}
						else{
							opts.inverse(this)
						}
					}
				},
				 subt:function(year,sub,opts){
					return Number(year) - Number(sub);
				 },
			 	isnot: function(a, b, opts) {
			 	if (a != b) {
			 	return opts.fn(this)
			 	} else {
			 	return opts.inverse(this)
			 	}
			 	},
			 	sanitize: function(strin,opts){
			 		return strin.trim() // Remove surrounding whitespace.
			 		.toLowerCase() // Lowercase.
			 		.replace(/[^a-z0-9]+/g,'-') // Find everything that is not a lowercase letter or number, one or more times, globally, and replace it with a dash.
			 		.replace(/^-+/, '') // Remove all dashes from the beginning of the string.
			 		.replace(/-+$/, ''); // Remove all dashes from the end of the string.
				 },
				parseDesc: function(bod,opts){
					return bod;
				},
				num: function(x,opts) {
					var parts = x.toString().split(".");
					parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
					return parts.join(".");
				},
				ind:function(i,opts){
					return Number(i) + 1;
				},
				temp:function(c,t,opts){
					if(c == "Beat"){
						return " | "+t+"BPM";
					}
					else{
						return "";
					}
				},
				entities: function(str,opts){
					var rep = str.replace(/</g,"&lt;").replace(/>/g,"&gt;")
					.replace(/"/g,"&quot;")
					.replace(/'/g,"&apos;")
					.replace(/\n/g,"<br>");
					return rep;
				},
				desc: function(x,opts){
					if(x == ''){
						return '*no description*';
					}
					else{
						var rep = x.replace(/</g,"&lt;").replace(/>/g,"&gt;")
						.replace(/"/g,"&quot;")
						.replace(/'/g,"&apos;")
						.replace(/\n/g,"<br>");
						return rep;
					}
				},
				cash: function(x,opts){
					if(x == null){
						return "0.00";
					}
					else{
						return num(x.toFixed(2));
					}
				},
				pix: function(p,opts){
					var l = p.split("##########");
					return l[0];
				},
				colox: function(col, opts){
					var co = col.split("\n");
					if(co.length == 0 || co == null || col == ""){
						return 'Not Specified';
					}
					else if(co.length == 1){
						return co[0];
					}
					else{
						var la = co.pop();
						return co.join(", ") + " and " + la;
					}
				},
				tixo: function(t,opts){
					return t.replace(/['|"]/gi,"");
				},
				cashx: function(p,d,opts){
					var di = parseInt(d);
					var pi = parseFloat(p);
					var x = pi - (pi * (di /100));
					if(x == null){
						return "0.00";
					}
					else{
						return num(x.toFixed(2));
					}
				}
			 } 
        });
        
		
app.engine('handlebars', handlebars.engine); 
app.set('view engine', 'handlebars');
app.set('port',process.env.PORT || 3000);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(require('cookie-parser')(conf.cookieSecret));
var session = require('express-session');
app.use(session({
    secret: conf.passwordCrypt,
    resave: true,
    saveUninitialized: true,
    cookie: {
    	secure: false,
    	maxAge: 86400000
    }
}));

app.use(require('csurf')()); 
app.use(function(req, res, next){
 res.locals._csrfToken = req.csrfToken(); 
 next(); 
});
app.use(express.static(__dirname + '/public'));

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  next()
});



app.use(function(req,res,next){
	var x = clone(site);
	x.smtp = null;
	x.prod = null;
	x.privilege = null;
	x.dev = null;
	res.locals.site = x;
	var da = new Date();
	var yy = da.getFullYear();
	var dy = {};
	var kk = Date.now();
	dy["year"] = yy;
	res.locals.date = dy;
	res.locals.dnow = kk;
	next();
});


app.use(function(req,res,next){
	if(req.session.user && req.session.user != null && req.session.user != ""){
		res.locals.activeUser = req.session.user;
		res.locals.activeEmail = req.session.email;
		res.locals.activeName = req.session.fn;
		next();
	}
	else{
		if(req.signedCookies.user && req.signedCookies.user != null && req.signedCookies.user != ""){
			var cook = req.signedCookies.user;
			cook = cook.split(" ");
			var uid = cook[0];
			var token = cook[1];
			var sql = "SELECT * FROM accounts WHERE userid="+esc(uid)+" AND token="+esc(token)+" AND status='verified';";
			con.query(sql,function(err,result){
				if(err){
					devErr(err);
					next();
				}
				else{
					if(result.length != 1){
						next();
					}
					else{
						req.session.user = result[0].userid;
						req.session.email = result[0].email;
						req.session.fn = result[0].fullname;
						res.locals.activeUser = result[0].userid;
						res.locals.activeEmail = result[0].email;
						res.locals.activeName = result[0].fullname;
						res.locals.loggedIn = result[0].userid;
						res.locals.cart = result[0].cart;
						res.locals.cartlu = result[0].cartlu;
						res.locals.tmxx = Date.now();
						if(result[0].cart == null){
							res.locals.cart = "";
						}
						next();
					}
				}
			});
		}
		else{
			next();
		}
	}
});


app.get("/",function(req,res){
	var genres = [];
	var products = [];
	var reserved = JSON.stringify([]);
	var sql = "SELECT * FROM genres ORDER BY genre ASC;"+
	"SELECT id,title,category,genre,tempo,quantity,price,discount,picture,date_added,timestamp FROM products WHERE public='1' AND NOT (category='Beat' AND price > 0 AND quantity < 1) ORDER BY id DESC LIMIT "+site.fetchLimit+";"+
	"SELECT id,title,category,genre,tempo,quantity,price,discount,picture,date_added,timestamp FROM products WHERE public='1' AND NOT (category='Beat' AND price > 0 AND quantity < 1) ORDER BY id DESC LIMIT "+site.fetchLimit+","+site.fetchMax+";";
	con.query(sql,function(err,result){
		if(err){
			devErr(err);
		}
		else{
			genres = result[0];
			products = result[1];
			reserved = JSON.stringify(result[2]);
		}
		var page = {};
		page.home = 1;
		page.pattern = 1;
		res.render("home",{page:page,genres:genres,products:products,reserved:reserved});
	});
});

app.get("/download-license/:oid",function(req,res){
	var oid = req.params.oid;
	if(/^SBO\-[a-zA-Z0-9]{10}$/.test(oid)){
		if((req.session.user && req.session.user != null && req.session.user != "") || (req.session.order && req.session.order != null && req.session.order != "" && req.session.order == oid)){
			var contd = function(okay){
				if(okay){
					var lin = site.addr + "/uploads/license-"+oid+".pdf";
					try{
						var x = request(lin);
						req.pipe(x);
						x.pipe(res);
					}
					catch(err){
						devErr(err);
						resErr(500,res);
					}
				}
				else{
					resErr(404,res);
				}
			}
			if(req.session.order){
				if(req.session.order == oid){
					contd(true);
				}
				else{
					contd(false);
				}
			}
			else{
				contd(true);
			}
		}
		else{
			resErr(404,res);
		}
	}
	else{
		resErr(404,res);
	}
});

app.post("/generate-license-893i04dnr3d",function(req,res){
	if(req.xhr || req.accepts('json,html')==='json'){
		var oid = req.body.oid;
		if(/^SBO\-[a-zA-Z0-9]{10}$/.test(oid)){
			if((req.session.user && req.session.user != null && req.session.user != "") || (req.session.order && req.session.order != null && req.session.order != "" && req.session.order == oid)){
				var sql = "SELECT * FROM orders WHERE orderid="+esc(oid)+" AND status='successful';";
				con.query(sql,function(err,result){
					if(err){
						devErr(err);
						res.send({err:1,message:'A server error was encountered. Please try again'});
					}
					else{
						if(result.length != 1){
							res.send({err:1,message:'Order not found.'});
						}
						else{
							var generateContd = function(triggerPush){
								if(triggerPush){
									var tm = parseInt(Date.now());
									var xtm = parseInt(result[0].license_stamp);
									var diff = tm - xtm 
									if(xtm != 0 && diff < 43200000){
										res.send({err:1,message:'You must wait 12 hours after you last downloaded a license for this order to be able to download again.'});
									}
									else{
										var ord = result[0];
										var sql = "SELECT * FROM downloads WHERE orderid="+esc(oid)+" ORDER BY itemtitle ASC;";
										con.query(sql,function(err,result){
											if(err){
												devErr(err);
												res.send({err:1,message:'A server error was encountered... Please try again.'});
											}
											else{
												var doc = new pdfDocument({
													modifying:false,
													size:'A4',
													margin: 72
												});
												var stream = doc.pipe(fs.createWriteStream('./public/uploads/license-'+oid+'.pdf'));
												doc.font('./public/fonts/Montaga-Regular.ttf');
												doc.fontSize(20)
												doc.text('License Agreement',{
													width:451.28,
													align:'center'
												});
												doc.moveDown(2);
												doc.fontSize(16);
												var ht = 'THIS AGREEMENT IS FOR THE BEAT(S)/SAMPLE(S) INCLUDED WITHIN: SEE EXIBIT A. AND NON-EXCLUSIVELY LICENSED BY: '+ord.fullname+
												' FROM LICENSOR: '+site.brand+'.';
												doc.text(ht,{
													width:451.28,
													align:'justify'
												});
												doc.text('EMAIL ADDRESS: '+ord.email,{
													width:451.28,
													align:'justify'
												});
												doc.text('ORDER ID: '+oid,{
													width:451.28,
													align:'justify'
												});
												doc.text('ORDER DATE: '+ord.dating,{
													width:451.28,
													align:'justify'
												});
												doc.fontSize(12);
												doc.text('For any questions please email '+site.brand+' at '+site.email,{
													width:451.28,
													align:'justify'
												});
												doc.moveDown(2);
												ht = 'Please take a moment to read the ‘Licensing/Copyright Notice’ below.';
												doc.text(ht,{
													width:451.28,
													align:'justify'
												});
												doc.moveDown();
												ht = 'The Sample(s)/Beat(s) remain(s) the property of its manufacturer '+site.brand+', (“Licensor”) and are licensed to you as the original end-user (“Licensee”), for use subject to the provisions below. All rights not expressly granted herein are reserved Non-Exclusively by Licensor';
												doc.text(ht,{
													width:451.28,
													align:'left'
												});
												doc.moveDown();
												ht = 'Licensing/Copyright Notice:';												
												doc.text(ht,{
													width:451.28,
													align:'justify'
												});
												doc.moveDown();
												ht = 'This license is granted for a single user only. In exchange for securing sample(s)/beat(s) within Exhibit A - You are now a License Holder who has nonexclusive rights with '+site.brand+' to use to the sample(s)/beat(s) within Exhibit A. As each sound and file within is 100% royalty free. By having non-exclusive rights with '+site.brand+', this is further defined by:';
												doc.text(ht,{
													width:451.28,
													align:'justify'
												});
												doc.moveDown();
												ht = 'a. You may use any sample/beat for your own personal project or commercial projects.';
												doc.text(ht,{
													width:370,
													align:'justify',
												});
												doc.moveDown();
												ht = 'i. Non-Exclusive rights include monetization of personal projects or commercial projects.';
												doc.text(ht,{
													width:340,
													align:'justify'
												});
												ht = 'ii. '+site.brand+' does not claim rights or claim any monetization percentages for personal projects or commercial projects.';
												doc.text(ht,{
													width:340,
													align:'justify'
												});
												doc.moveDown();
												ht = 'b. You may use any sample/beat for your distribution or placements.';												
												doc.text(ht,{
													width:370,
													align:'justify'
												});
												doc.moveDown();
												ht = 'i. Non-Exclusive rights includes monetization of tracks, beats, songs, placements or uploads for distribution and placements.';
												doc.text(ht,{
													width:340,
													align:'justify'
												});
												ht = 'ii. '+site.brand+' does not claim rights or claim any monetization percentages for distributed tracks, beats, songs, placements or uploads.';
												doc.text(ht,{
													width:340,
													align:'justify'
												});
												ht = 'iii. i.e All Platforms including Soundcloud, YouTube, Spotify, Apple Music, Distributors, Beat Selling Platforms Etc';
												doc.text(ht,{
													width:340,
													align:'justify'
												});
												doc.moveDown();

												ht = 'c. You have Non-Exclusive rights to the use or manipulate any sample within Exhibit A and do not need to credit for distribution.';
												doc.text(ht,{
													width:370,
													align:'justify'
												});
												doc.moveDown();

												ht = 'i. Non-Exclusive rights includes complete control of every sample/beat found within Exhibit A as each sample/beat are 100% royalty free';
												doc.text(ht,{
													width:340,
													align:'justify'
												});
												ht = 'ii. '+site.brand+' does not claim royalties in any way as the samples/beats are 100% royalty free';
												doc.text(ht,{
													width:340,
													align:'justify'
												});
												doc.moveDown();

												ht = 'By downloading, you are now a [Active License Holder] and you are in agreement with:';
												doc.text(ht,{
													width:451.28,
													align:'justify'
												});
												doc.moveDown();

												ht = 'd. You do not have rights or permission to re-sell any sample or beat within Exhibit A as your own product.';
												doc.text(ht,{
													width:370,
													align:'justify'
												});
												doc.moveDown();

												ht = 'i. No re-distribution of the sounds or files found within Exhibit A as another product or sold separately as your own sound.';
												doc.text(ht,{
													width:340,
													align:'justify'
												});
												ht = 'ii. '+site.brand+' takes legal action/takedowns against those not abiding by the Non-Exclusive rights with '+site.brand+'.';
												doc.text(ht,{
													width:340,
													align:'justify'
												});
												doc.moveDown();

												ht = 'e. You do not have permission to share, transfer or sell your license.';
												doc.text(ht,{
													width:370,
													align:'justify'
												});
												doc.moveDown();

												ht = 'i. The license granted is for a single user only and non-transferable.';
												doc.text(ht,{
													width:340,
													align:'justify'
												});
												ht = 'ii. The license is bound to the original Licensee only. (i.e you may not transfer or sell your license).';
												doc.text(ht,{
													width:340,
													align:'justify'
												});
												ht = 'ii. '+site.brand+' takes legal action/takedowns against those not abiding by the Non-Exclusive rights with '+site.brand+'.';
												doc.text(ht,{
													width:340,
													align:'justify'
												});
												doc.moveDown(2);
												doc.fontSize(20);
												doc.text('Exhibit A.',{
													width:451.28,
													align:'justify'
												});
												doc.moveDown();
												doc.fontSize(14);
												result.forEach(function(dow){
													doc.text(dow.itemtitle + " ("+dow.itemtype+")",{
														width:451.28,
														align:'justify'
													});
													doc.moveDown();
												});
												doc.end();
												stream.on('finish',function(){
													var sql = "UPDATE orders SET license_stamp="+esc(Date.now())+" WHERE orderid="+esc(oid)+";";
													con.query(sql,function(err,result){
														if(err){
															devErr(err);
														}
														res.send({succ:1});
													});
												});
											}
										});
									}
								}
								else{
									res.send({err:1,message:'Access Denied!'});
								}
							}
							if(req.session.user && req.session.user != null && req.session.user != ""){
								if(req.session.user == result[0].userid){
									generateContd(true);
								}
								else{
									generateContd(false);
								}
							}
							else{
								generateContd(true);
							}
						}
					}
				});
			}
			else{
				res.send({err:1,message:'Access Denied!'});
			}
		}
		else{
			res.send({err:1,message:'Illegal data!'});
		}
	}
	else{
		res.send({err:1,message:'Illegal Gateway!'});
	}
});

app.get("/licensing",function(req,res){
	var oid = req.query.orderid;
	var page = {};
	page.title = "Licensing";
	page.description = "Download license for your order and also verify license validity";
	page.script = "licensing";
	page.licensing = 1;
	if(/^SBO\-[a-zA-Z0-9]{10}$/.test(oid)){
		res.render("licensing",{layout:'empty',page:page,oid:oid});
	}
	else{
		res.render("licensing",{layout:'empty',page:page});
	}
})

app.get("/linkx/:stx/:tit",function(req,res){
	if((req.session.user && req.session.user != null && req.session.user != "") || (req.session.order && req.session.order != null && req.session.order != "")){
		var st = req.params.stx;
		st = st.split("-");
		var id = st[0];
		var ref = st[1];
		var txt = '';
		if(req.session.order && req.session.order != null && req.session.order != ""){
			txt = " AND orderid="+esc(req.session.order);
		}
		if(st.length == 2 && /^\d{1,11}$/.test(id) && !/[^a-z0-9]/ig.test(ref)){
			var sql = "SELECT * FROM downloads WHERE id="+esc(id)+" AND ref="+esc(ref)+txt+";"+
			"UPDATE downloads SET downloaded = downloaded + 1 WHERE id="+esc(id)+" AND ref="+esc(ref)+";";
			con.query(sql,function(err,result){
				if(err){
					devErr(err);
					resErr(500,res);
				}
				else{
					if(result[0].length == 1){
						if(result[0][0].downloaded < 50 && sanitize(result[0][0].itemtitle) == req.params.tit){
							var lin = result[0][0].link;
							if(site.mode == "dev"){
								lin = site.addr + lin;
							}
							try{
								var x = request(lin);
								req.pipe(x);
								x.pipe(res);
							}
							catch(err){
								devErr(err);
								resErr(500,res);
							}
						}
						else{
							resErr(404,res);
						}
					}
					else{
						resErr(404,res);
					}
				}
			});
		}
		else{
			resErr(404,res);
		}
	}
	else{
		resErr(404,res);
	}
});

app.get("/download/:oid/:uid",function(req,res){
	if(/^\d{10}$/.test(req.params.uid) && /^SBO\-[a-zA-Z0-9]{10}$/.test(req.params.oid)){
		var o = req.params.oid;
		var u = req.params.uid;
		var sql = "SELECT * FROM orders WHERE orderid="+esc(o)+" AND userid="+esc(u)+" AND status='successful';";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
				resErr(500,res);
			}
			else{
				if(result.length != 1){
					resErr(404,res);
				}
				else{
					var ord = result[0];
					var tm = Date.now();
					var diff = tm - parseInt(ord.timestamp);
					if(diff <= 172800000){
						req.session.order = ord.orderid;
						req.session.ema = true;
						res.redirect("/order/"+ord.orderid);
					}
					else{
						resErr(404,res);
					}
					
				}
			}
		});
	}
	else{
		resErr(404,res);
	}
});

app.get("/terms-and-conditions",function(req,res){
	var page = {title:'Terms and Conditions',description:'This contains information for our clients, visitors, etc'};
	res.render("terms",{layout:'empty',page:page});
});

app.get("/privacy-policy",function(req,res){
	var page = {title:'Privacy Policy',description:'This contains policies and information on what data are collected and how they are handled'};
	res.render("privacy",{layout:'empty',page:page});
});

app.get("/about-us",function(req,res){
	var page = {title:'About Us',description:site.brand+' is a music production brand that focuses on creating thought-provoking beats that inspire and motivate people(content creators, artists, e.t.c.) to unleash the monster in them. And by that "Monster", we mean the great talents hidden within them for the world to hear/see.'};
	page.about = 1;
	res.render("about",{layout:'empty',page:page});
});

app.get("/contact-us",function(req,res){
	var page = {title:'Contact Us',description:site.brand+'Click to contact us.'};
	page.contact = 1;
	res.render("contact",{layout:'empty',page:page});
});

app.get("/order/:oid",function(req,res){
	var o = req.params.oid;
	if(req.session.order && req.session.order != null && req.session.order != ""){
		if(req.session.order == o){
			var sql = "SELECT * FROM orders WHERE orderid="+esc(o)+" AND status='successful';"+
			"SELECT * FROM downloads WHERE orderid="+esc(o)+" ORDER BY itemtitle ASC;";
			con.query(sql,function(err,result){
				if(err){
					devErr(err);
					resErr(500,res);
				}
				else{
					if(result[0].length != 1){
						resErr(404,res);
					}
					else{
						if(result[1].length == 0){
							resErr(500,res);
						}
						else{
							var order = result[0][0];
							var products = result[1];
							if(req.session.ema == true){
								res.locals.ema = 1;
								delete req.session.ema;
							}
							if(req.session.newOrder && req.session.newOrder == 1){
								res.locals.newOrder = 1;
								delete req.session.newOrder;
							}
							var page = {};
							page.title = "Order "+o+" Confirmed";
							page.description = "";
							page.ni = 1;
							res.render("downloads",{layout:'empty',page:page,order:order,products:products});
						}
					}
				}
			});
		}
		else{
			resErr(404,res);
		}
	}
	else{
		resErr(404,res);
	}
});

app.post("/create-order-session-hbu383",function(req,res){
	if(req.xhr || req.accepts('json,html')==='json'){
		if((req.session.user && req.session.user != null && req.session.user != "") || (req.session.oid && req.session.oid != null && req.session.oid != "")){
			var oid = req.body.oid;
			var uid = req.body.uid;
			if((req.session.user == uid) || (req.session.oid == oid)){
				try{
					req.session.oid = null;
					delete req.session.oid;
				}
				catch(e){
					// do nothing
				}
				finally{
					req.session.order = oid;
					if(req.body.ema){
						req.session.ema = req.body.ema;
					}
					if(req.session.oid && req.session.oid != null && req.session.oid != ""){
						req.session.newOrder = 1;
					}
					res.send({succ:1});
				}
			}
		}
		else{
			res.send({err:1,message:'Illegal gateway*'});
		}
	}
	else{
		res.send({err:1,message:'Illegal gateway!'});
	}
});

app.get("/cart",function(req,res){
	var page = {};
	page.title = "Cart";
	page.description = "";
	page.ni = 1;
	page.style = "cart";
	page.script = "cart";
	page.cart = 1;
	res.render("cart",{layout:'empty',page:page});
});

app.get("/premium",function(req,res){
	var sql = "SELECT * FROM genres ORDER BY genre ASC;"+
	"SELECT id,title,category,genre,tempo,quantity,price,discount,picture,date_added,timestamp FROM products WHERE public='1' AND price > 0 AND NOT (category='Beat' AND price > 0 AND quantity < 1) ORDER BY id DESC LIMIT "+site.fetchLimit+";"+
	"SELECT id,title,category,genre,tempo,quantity,price,discount,picture,date_added,timestamp FROM products WHERE public='1' AND price > 0 AND NOT (category='Beat' AND price > 0 AND quantity < 1) ORDER BY id DESC LIMIT "+site.fetchLimit+","+site.fetchMax+";";
	con.query(sql,function(err,result){
		if(err){
			devErr(err);
			resErr(500,res);
		}
		else{
			var genres = result[0];
			var products = result[1];
			var reserved = JSON.stringify(result[2]);
			var page = {};
			page.title = 'Premium Beats, Sample packs and Plugins';
			page.description = 'Purchase high quality beats, sample packs and plugins produced by '+site.brand+' for your songs and music production.';
			page.premium = 1;
			res.render("premium",{layout:'empty',page:page,genres:genres,products:products,reserved:reserved});
		}
	});
});

app.get("/item/:id/:gc/:tit",function(req,res){
	var id = req.params.id;
	var gc = req.params.gc;
	var tit = req.params.tit;
	var sql = "SELECT id,title,category,genre,tempo,quantity,price,discount,picture,date_added,timestamp,public FROM products WHERE id="+esc(id)+" AND NOT (category='Beat' AND price > 0 AND quantity < 1);";
	con.query(sql,function(err,result){
		if(err){
			devErr(err);
			resErr(500,res);
		}
		else{
			if(result.length != 1){
				resErr(404,res);
			}
			else{
				var dgc = sanitize(result[0].genre) + "-" + sanitize(result[0].category);
				var dtit = sanitize(result[0].title);
				if(dgc != gc || dtit != tit){
					resErr(404,res);
				}
				else{
					var product = result[0];
					if(product.public == 1){
						var products = [];
						var reserved = JSON.stringify([]);
						var sql = "SELECT id,title,category,genre,tempo,quantity,price,discount,picture,date_added,timestamp FROM products WHERE public='1' AND category="+esc(product.category)+" AND genre="+esc(product.genre)+" AND NOT (id="+esc(product.id)+" OR (category='Beat' AND price > 0 AND quantity < 1)) ORDER BY id DESC LIMIT "+site.fetchLimit+";"+
						"SELECT id,title,category,genre,tempo,quantity,price,discount,picture,date_added,timestamp FROM products WHERE public='1' AND category="+esc(product.category)+" AND genre="+esc(product.genre)+" AND NOT (id="+esc(product.id)+" OR (category='Beat' AND price > 0 AND quantity < 1)) ORDER BY id DESC LIMIT "+site.fetchLimit+","+site.fetchMax+";"+
						"UPDATE products SET views = views + 1 WHERE id="+esc(product.id)+";";
						con.query(sql,function(err,result){
							if(err){
								devErr(err);
							}
							else{
								products = result[0];
								reserved = JSON.stringify(result[1]);
							}
							var page = {};
							page.title = product.title;
							page.description = product.genre + " " + product.category + ". " + product.tempo + "BPM";
							page.cover = product.picture;
							page.share = 1;
							res.render("product",{layout:'empty',page:page,product:product,products:products,reserved:reserved});
						});
					}
					else{
						var page = {};
						page.title = product.title;
						page.description = 'This item is currently not available! Please check back shortly...';
						res.render("errors",{layout:'empty',page:page});
					}
				}
			}
		}
	});
});

app.get("/free",function(req,res){
	var sql = "SELECT * FROM genres ORDER BY genre ASC;"+
	"SELECT id,title,category,genre,tempo,quantity,price,discount,picture,date_added,timestamp FROM products WHERE public='1' AND price = 0 AND NOT (category='Beat' AND price > 0 AND quantity < 1) ORDER BY id DESC LIMIT "+site.fetchLimit+";"+
	"SELECT id,title,category,genre,tempo,quantity,price,discount,picture,date_added,timestamp FROM products WHERE public='1' AND price = 0 AND NOT (category='Beat' AND price > 0 AND quantity < 1) ORDER BY id DESC LIMIT "+site.fetchLimit+","+site.fetchMax+";";
	con.query(sql,function(err,result){
		if(err){
			devErr(err);
			resErr(500,res);
		}
		else{
			var genres = result[0];
			var products = result[1];
			var reserved = JSON.stringify(result[2]);
			var page = {};
			page.title = 'Free Beats, Sample packs and Plugins';
			page.description = 'Download free high quality beats, sample packs and plugins produced by '+site.brand+' for your songs and music production.';
			page.free = 1;
			res.render("free",{layout:'empty',page:page,genres:genres,products:products,reserved:reserved});
		}
	});
});

app.get("/genre/:id/:genre/:key",function(req,res){
	var id = req.params.id;
	var gen = req.params.genre;
	var key = req.params.key;
	if(key == "free" || key == "all" || key == "premium"){
		var sq;
		switch(key){
			case "free":
				sq = " AND price = 0 ";
			break;
			case "premium":
				sq = " AND price > 0 ";
			break;
			default:
				sq = " ";	
		}
		var sql = "SELECT * FROM genres WHERE id="+esc(id)+";";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
				resErr(500,res);
			}
			else{
				if(result.length != 1){
					resErr(404,res);
				}
				else{
					if(sanitize(result[0].genre) != gen){
						resErr(404,res);
					}
					else{
						gen = result[0].genre;
						var sql = "SELECT * FROM genres ORDER BY genre ASC;"+
						"SELECT id,title,category,genre,tempo,quantity,price,discount,picture,date_added,timestamp FROM products WHERE public='1' AND genre="+esc(gen)+" "+sq+" AND NOT (category='Beat' AND price > 0 AND quantity < 1) ORDER BY id DESC LIMIT "+site.fetchLimit+";"+
						"SELECT id,title,category,genre,tempo,quantity,price,discount,picture,date_added,timestamp FROM products WHERE public='1' AND genre="+esc(gen)+" "+sq+" AND NOT (category='Beat' AND price > 0 AND quantity < 1) ORDER BY id DESC LIMIT "+site.fetchLimit+","+site.fetchMax+";";
						con.query(sql,function(err,result){
							if(err){
								devErr(err);
								resErr(500,res);
							}
							else{
								var genres = result[0];
								var products = result[1];
								var reserved = JSON.stringify(result[2]);
								var page = {};
								page.title = gen + ' Beats, Sample packs and Plugins('+key+')';
								page.description = 'Download or purchase high quality '+gen+' beats, sample packs and plugins produced by '+site.brand+' for your songs and music production.';
								res.render("genre",{layout:'empty',page:page,genres:genres,products:products,reserved:reserved,genre:gen,key:key});
							}
						});
					}
				}
			}
		});
	}
	else{
		resErr(404,res);
	}
	
});

app.get("/account/sign-up",function(req,res){
	var page = {};
	page.title = 'Sign Up';
	page.description = 'Create a user account for free.';
	page.pattern = 1;
	page.script = "user";
	page.register = 1;
	page.signup = 1;
	res.render("register",{layout:'empty',page:page});
});

app.post("/customer/48e93i87fhd32893",function(req,res){
	if(req.xhr || req.accepts('json,html')==='json'){
		generateUID(function(id){
			if(id == null){
				res.send({err:1,message:'Error generating ID. Please try again'});
			}
			else{
				var uid = id;
				generatePassword(function(pwx){
					var pwr = pw(pwx);
					var fn = req.body.fn;
					var em = req.body.em;
					var sql = "SELECT * FROM accounts WHERE email="+esc(em)+";";
					con.query(sql,function(err,result){
						if(err){
							devErr(err);
							res.send({err:1,message:'A server error occurred. Please try again'});
						}
						else{
							if(result.length != 0){
								res.send({err:1,message:'This email has already been used to sign up on this site. Please sign into your account to checkout'});
							}
							else{
								var ref = refgen.newr();
								var token = refgen.newr() + "" + refgen.newr();
								var tm = Date.now();
								dateAndTime(function(dd){
									var sql = "INSERT INTO accounts(fullname,email,password,status,ref,token,date_added,timestamp,userid,cart,cartlu) "+
									"VALUES("+esc(fn)+","+esc(em)+","+esc(pwr)+",'registered',"+esc(ref)+","+esc(token)+","+esc(dd)+","+esc(tm)+","+esc(uid)+","+esc(req.body.cart)+","+esc(Date.now())+");";
									var link = site.addr + "/verify/" + em + "/" + ref;
									if(site.mode == "prod"){
										var sender = site.brand;
										var senderID = site.brand.toLowerCase();
										var title = "Your Account Has Been Created On " +site.brand;
										var body = '<div style="width:100%;text-align:left">'+
										'<p class="text">Dear '+fn+', an account for you has been created for you on '+site.brand+' following your checkout request, this enables you to easily make and manage your orders. <br><br>Your password is <u>'+pwx+'</u><br><br> You will need to verify your email before you can sign in. To verify your email, please click the button below</p><br><a class="btn" href="'+link+'">Verify</a><br><br>'+
										'<p class="text">Or visit this link <small>'+link+'</small><br><br>please do not share the link with other people<br><br>Please ignore this email if you did not register on '+site.domain+'</p>'+
										'</div>';
										send_mail({
											to:em,
											body:body,
											sender:sender,
											senderID:senderID,
											title:title,
											callback:function(err,result){
												if(err){
													res.send({err:1,message:"Mailing error... please try again"});
												}
												else{
													con.query(sql,function(err,result){
														if(err){
															devErr(err);
															res.send({err:1,message:"server error... please try again"});
														}
														else{
															res.send({succ:1,uid:uid});
														}
													});
												}
											}
										});
									}
									else{
										con.query(sql,function(err,result){
											if(err){
												devErr(err);
												res.send({err:1,message:'Server error'});
											}
											else{
												console.log("New Registration => "+link + " Password: "+pwx);
												res.send({succ:1,uid:uid});
											}
										});
									}
								});
							}
						}
					});
				});
			}
		});
	}
	else{
		res.send({err:1,message:'Illegal gateway'});
	}
});

function generatePassword(fn){
	var p = Math.random().toString(36);
	var sym = ['%','#','@','*','!'];
	var cap = ['A','B','C','D','E','F','G','H','I','J','K','M','N','O','P','Q'];
	var nux = ['0','1','2','3','4','5','6','7','8','9']
	p += sym[Math.floor(Math.random() * 5)] + sym[Math.floor(Math.random() * 5)] + sym[Math.floor(Math.random() * 5)];
	p = p.slice(-8);
	p = cap[Math.floor(Math.random() * 16)] + nux[Math.floor(Math.random() * 10)] + p;
	fn(p);
}



app.get('/verify/:em/:ref',function(req,res){
	var sql = "SELECT * FROM accounts WHERE email="+esc(req.params.em)+" AND ref="+esc(req.params.ref)+" AND status='registered';";
	con.query(sql,function(err,result){
		if(err){
			devErr(err);
			resErr(500,res);
		}
		else{
			if(result.length != 1){
				resErr(404,res);
			}
			else{
				if(result[0].userid == null || result[0].userid == ""){
					generateUID(function(id){
						if(id == null){
							resErr(500,res);
						}
						else{
							var sql = "UPDATE accounts SET userid="+esc(id)+",status='verified'  WHERE email="+esc(req.params.em)+" AND ref="+esc(req.params.ref)+";"+
							"INSERT INTO support(user,type,message,message_type,dating,timestamp) "+
							"VALUES("+esc(id)+",'send','Congratulations on your successful registration! To make enquiries, complaints, e.t.c. You can use this tab to send a support message to the admin.','text','Welcome Message','Welcome Message');";
							con.query(sql,function(err,result){
								if(err){
									devErr(err);
									resErr(500,res);
								}
								else{
									req.session.message = 'Your account has been verified successfully! You can now sign in.';
									res.redirect("/account/sign-in");
								}
							});
						}
					});
				}
				else{
					var sql = "UPDATE accounts SET status='verified'  WHERE email="+esc(req.params.em)+" AND ref="+esc(req.params.ref)+";"+
					"INSERT INTO support(user,type,message,message_type,dating,timestamp) "+
					"VALUES("+esc(result[0].userid)+",'send','Congratulations on your successful registration! To make enquiries, complaints, e.t.c. You can use this tab to send a support message to the admin.','text','Welcome Message','Welcome Message');";
					con.query(sql,function(err,result){
						if(err){
							devErr(err);
							resErr(500,res);
						}
						else{
							req.session.message = 'Your account has been verified successfully! You can now sign in.';
							res.redirect("/account/sign-in");
						}
					});
				}
			}
		}
	});
});

app.get("/checkout/:oid",function(req,res){
	if(req.session.oid && req.session.oid != null && req.session.oid != ""){
		if(req.session.oid == req.params.oid){
			var oid = req.session.oid;
			var sql = "SELECT * FROM orders WHERE orderid="+esc(oid)+" AND status='pending';";
			con.query(sql,function(err,result){
				if(err){
					devErr(err);
					resErr(500,res);
				}
				else{
					if(result.length != 1){
						resErr(404,res);
					}
					else{
						var order = result[0];
						var page = {};
						page.ni = 1;
						page.paystack = 1;
						page.title = 'Checkout';
						page.description = "";
						page.script = "checkout";
						page.style = "cart"
						res.render("checkout",{layout:'empty',page:page,order:order});
					}
				}
			});
		}
		else{
			req.session.oid = null;
			delete req.session.oid;
			res.redirect("/cart");
		}
	}
	else{
		res.redirect("/cart");
	}
});

app.get("/co-logout",function(req,res){
	req.session.oid = null;
	delete req.session.oid;
	res.redirect("/cart");
});

app.get("/account/sign-in",function(req,res){
	if(req.session.user && req.session.user != null && req.session.user != ""){
		res.redirect("/account/dashboard");
	}
	else{
		var page = {};
		page.title = 'Sign In';
		page.description = 'Sign in to your user account';
		page.pattern = 1;
		page.script = "user";
		page.login = 1;
		page.signin = 1;
		if(req.session.message && req.session.message != null && req.session.message != ""){
			page.message = "" + req.session.message;
			req.session.message = null;
			delete req.session.message;
		}
		res.render("login",{layout:'empty',page:page});
	}
});

app.get("/visits",function(req,res){
	if(req.xhr || req.accepts('json,html')==='json'){
		res.send(req.ip + "#####" + new Date().getTime());
	}
	else{
		resErr(404,res);
	}
});

app.post("/create-order-session",function(req,res){
	if(req.xhr || req.accepts('json,html')==='json'){
		req.session.oid = req.body.oid;
		res.send("*****");
	}
	else{
		res.send("*****");
	}
});

app.post("/user/login",function(req,res){
	if(req.xhr || req.accepts('json,html')==='json'){
		var pwd = pw(req.body.password);
		con.query("SELECT * FROM accounts WHERE email="+esc(req.body.email),function(err,result){
			if(err){
				res.send({err:1,message:"SERVER ERROR... please try again"});
			}
			else{
				if(result.length !== 1){
					res.send({err:1,message:"Invalid login details"});
				}
				else{
					var user = result[0];
					if(user.password !== pwd){
						res.send({err:1,message:"Invalid login details"});
					}
					else{
						if(/^verified$/i.test(user.status)){
							req.session.user = user.userid;
							req.session.email = user.email;
							if(req.body.save == "yes"){
								res.cookie("user",user.userid + " " + user.token,cOpts);
							}
							res.send({succ:1,user:user.userid});
						}
						else if(/^registered$/i.test(user.status)){
							res.send({err:1,message:"You cannot login until you have verified your account"});
						}
						else{
							res.send({err:1,message:"Access denied! Your account has been blocked by an admin. Please contact us for more details."});
						}
					}
				}
			}
		});
	}
	else{
		res.send(404);
	}
});

app.get("/account/logout/:id",function(req,res){
	var id = req.params.id;
	req.session.user = "";
	req.session.user = null;
	delete req.session.user;
	req.session.email = "";
	req.session.email = null;
	delete req.session.email;
	res.clearCookie("user");
	res.redirect("/account/sign-in");
});

app.get("/reset-password/:email/:ref",function(req,res){
	var em = req.params.email;
	var ref = req.params.ref;
	var nref = refgen.newr();
	var sql = "SELECT * FROM accounts WHERE email="+esc(em)+" AND ref="+esc(ref)+";"+
	"UPDATE accounts SET ref="+esc(nref)+" WHERE email="+esc(em)+";";
	con.query(sql,function(err,result){
		if(err){
			devErr(err);
			var page = {};
			page.title = "Password Reset - A server error occured";
			page.pattern = 1;
			page.description = "Please refresh this page to try again. Contact us if this problem persists";
			res.render("errors",{layout:'empty',page:page});
		}
		else{
			if(result[0].length != 1){
				resErr(404,res);
			}
			else{
				var page = {};
				page.title = "Reset Password";
				page.description = "This is a one-time link to a private page.";
				page.script = "user";
				page.pattern = 1;
				res.render("reset",{layout:'empty',email:em,ref:nref,page:page});
			}
		}
	});
});

app.get("/account/dashboard",function(req,res){
	if(req.session.user && req.session.user != null && req.session.user != ""){
		var qx = req.query.u;
		var sql = "SELECT * FROM accounts WHERE userid="+esc(req.session.user)+";";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
				resErr(500,res);
			}
			else{
				if(result.length != 1){
					req.session.message = 'Invalid session detected. You have been forced to log out';
					res.redirect("/account/logout/1");
				}
				else{
					if(qx != "undefined" && qx != null && /^\d{10}$/.test(qx)){
						res.locals.loggedIn = qx;
						res.locals.cart = result[0].cart;
						res.locals.cartlu = result[0].cartlu;
						res.locals.tmxx = Date.now();
						if(result[0].cart == null){
							res.locals.cart = "";
						}
					}
					var user = result[0];
					var page = {}
					page.title = "Welcome, "+user.email+"!";
					page.description = "User dashboard.";
					page.script = "dashboard";
					page.style = "dashboard";
					page.dash = 1;
					page.dashboard = 1;
					page.pattern = 1;
					page.in = 1;
					page.uploader = 1;
					res.render("dashboard",{layout:'empty',user:user,page:page});
				}
			}
		});
	}
	else{
		res.redirect("/account/sign-in");
	}
});

app.post("/reset-password",function(req,res){
	if(req.xhr || req.accepts('json,html')==='json'){
		var fx = req.body;
		var pwx = pw(fx.pw);
		var ref = refgen.newr();
		var sql = "UPDATE accounts SET password="+esc(pwx)+" WHERE email="+esc(fx.em)+" AND ref="+esc(fx.ref)+";"+
		"UPDATE accounts SET ref="+esc(ref)+" WHERE email="+esc(fx.em)+" AND ref="+esc(fx.ref)+";";
		con.query(sql,function(err,resul){
			if(err){
				devErr(err);
				res.send({err:1,message:"Server error. please try again"});
			}
			else{
				req.session.message = 'Your password has been changed successfully!';
				res.send({succ:1});
			}
		});
	}
	else{
		res.send(404);
	}
});


app.get("/admin",function(req,res){
	if(req.session.admin && req.session.admin != null && req.session.admin != ""){
		var username = req.session.admin;
		var sql = "SELECT * FROM admin WHERE username="+esc(username);
		con.query(sql,function(err,result){
			if(err){
				resErr(500,res);
			}
			else{
				if(result.length != 1){
					resErr(500,res);
				}
				else{
					var admin = result[0];
					var username = admin.username;
					var page = {script:'admin',style:'admin',title:'Welcome Back ' + username,description:'This is site admin dashboard',uploader:1,ni:1};
					res.render('admin',{layout:'empty',page:page,username:username});
				}
			}
		});
	}
	else{
		var page = {title:'Admin Login',description:'admin login page',script:'user',pattern:1};
		if(req.signedCookies.admin && req.signedCookies.admin !== ""){
			var username = req.signedCookies.admin;
			con.query("SELECT * FROM admin WHERE username="+esc(username)+";",function(err,result){
				if(err){
					res.render('admin_login',{layout:'empty',page:page});
				}
				else{
					if(result.length == 1){
						req.session.admin = result[0].username;
						res.redirect("/admin");
					}
					else{
						res.render('admin_login',{layout:'empty',page:page});
					}
				}
			});
		}
		else{
			res.render('admin_login',{layout:'empty',page:page});
		}
	}
});

app.get("/admin_logout/:data",function(req,res){
	var data = Number(req.params.data);
	req.session.admin = "";
	req.session.admin = null;
	delete req.session.admin;
	if(data == 1){
		res.clearCookie("admin",cOpts);
		res.redirect("/admin_res");
	}
	else{
		res.redirect("/");
	}
});

app.get("/admin_res",function(req,res){
	res.clearCookie("admin");
	res.redirect("/admin");
});

app.post("/admin",function(req,res){
	var pwd = pw(req.body.password);
	if(req.xhr || req.accepts('json,html')==='json'){
		con.query("SELECT * FROM admin WHERE username="+esc(req.body.username)+";",function(err,result){
			if(err){
				res.send({err:1,message:"SERVER ERROR... please try again"});
			}
			else{
				if(result.length !== 1){
					res.send({err:1,message:"Invalid login details"});
				}
				else{
					var user = result[0];
					if(user.password !== pwd){
						res.send({err:1,message:"Invalid login details"});
					}
					else{
						req.session.admin = user.username;
						if(req.body.save == "yes"){
							var kk = clone(cOpts);
							kk.maxAge = 10800000;
							res.cookie("admin",user.username,kk);
						}
						res.send({succ:1});
					}
				}
			}
		});
	}
	else{
		res.send(404);
	}
});

/*
app.get("/dynamic-pages",function(req,res){
	var sql = "SELECT * FROM events WHERE status='approved' ORDER BY id DESC;";
	con.query(sql,function(err,result){
		if(err){
			devErr(err);
			resErr(500,res);
		}
		else{
			var page = {};
			page.title = "Dynamic Pages";
			page.description = "This page contains the link to all dynamic pages on this site.";
			var obj = {};
			obj.layout = "empty";
			obj.page = page;
			obj.events = result;
			res.render("dynamic",obj);
		}
	});
});
*/
app.use(function (req,res){ 
	resErr(404,res);
});

app.use(function(err, req, res, next){
	devErr(err);
	resErr(500,res);
});



http.listen(app.get('port'), function (){
	console.log( 'express started on http://localhost:' + app.get('port') + '; press Ctrl-C to terminate.' ); 
});

function esc(a){
	return con.escape(a);
}

function pw(pw){
	return crypto.createHmac('sha256', pw).update(conf.passwordCrypt).digest('hex');  
}


async function generateUID(fn){
	var n = 1;
	var uid = null;
	var l = ["1","2","3","4","5","6","7","8","9","0"];
	var lim = 1;
	while(n != 2){
		var sid = l[Math.floor(Math.random() * 9)] + l[Math.floor(Math.random() * 10)] + l[Math.floor(Math.random() * 10)] + l[Math.floor(Math.random() * 10)] + l[Math.floor(Math.random() * 10)] + l[Math.floor(Math.random() * 10)] + l[Math.floor(Math.random() * 10)] + l[Math.floor(Math.random() * 10)] + l[Math.floor(Math.random() * 10)] + l[Math.floor(Math.random() * 10)];
		var chk = await checkUID(sid);
		if(chk.err){
			n = 2;
		}
		else if(chk.id){
			uid = chk.id;
			n = 2;
		}
		else{
			if(lim > 500){
				n = 2;
			}
			else{
				lim++;
			}
		}
	}
	fn(uid);
}

function checkUID(sid){
	return new Promise(function(resolve,reject){
		var sql = "SELECT * FROM accounts WHERE userid="+esc(sid)+";";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
				resolve({err:1});
			}
			else{
				if(result.length > 0){
					resolve({});
				}
				else{
					resolve({id:sid});
				}
			}
		});
	});
}

async function generateOID(fn){
	var n = 1;
	var uid = null;
	var l = ['a','B','c','d','E','f','G','h','i','J','k','l','M','n','o','P','q','r','S','t','U','v','w','X','y','Z','0','1','2','3','4','5','6','7','8','9'];
	var lim = 1;
	while(n != 2){
		var sid = l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)];
		var chk = await checkOID(sid);
		if(chk.err){
			n = 2;
		}
		else if(chk.id){
			uid = chk.id;
			n = 2;
		}
		else{
			if(lim > 500){
				n = 2;
			}
			else{
				lim++;
			}
		}
	}
	fn("SBO-"+uid);
}

function checkOID(sid){
	return new Promise(function(resolve,reject){
		var sql = "SELECT * FROM orders WHERE orderid="+esc(sid)+";";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
				resolve({err:1});
			}
			else{
				if(result.length > 0){
					resolve({});
				}
				else{
					resolve({id:sid});
				}
			}
		});
	});
}


function clone(arr){
	return JSON.parse(JSON.stringify(arr));
}



function secretgen(fn){
	var secret = refgen.newr();
	var sec = secret.slice(0,10);
	var enc = pw(sec);
	var obj = {};
	obj.sec = sec;
	obj.enc = enc;
	fn(obj);
}

function resErr(code,res){
	if(code == 404){
		res.status(404); 
		var page = {title:'ERROR 404: Not Found',pattern:1,description:'Sorry! The page you are looking for might have been broken or expired.'};
		res.render('errors',{layout:'empty',page:page});
	}
	else if(code == 500){
		res.status(500); 
		var page = {title:'Internal Server Error',pattern:1,description:'Sorry! An internal server error was encountered while processing your request.'};
		res.render('errors',{layout:'empty',page:page});
	}
	else{
		res.status(404); 
		var page = {title:'ERROR 404: Not Found',pattern:1,description:'Sorry! The page you are looking for might have been broken or expired.'};
		res.render('errors',{layout:'empty',page:page});
	}
}


function sanitize(strin) {
    return strin.trim() // Remove surrounding whitespace.
    .toLowerCase() // Lowercase.
    .replace(/[^a-z0-9]+/g,'-') // Find everything that is not a lowercase letter or number, one or more times, globally, and replace it with a dash.
    .replace(/^-+/, '') // Remove all dashes from the beginning of the string.
    .replace(/-+$/, ''); // Remove all dashes from the end of the string.
}

function dateAndTime(fn){
	var a = new Date();
	var dd = a.getDate();
	var mm = a.getMonth();
	var yyyy = a.getFullYear();
	var hh = a.getHours();
	var am;
	if(hh > 11){
		am = "PM";
		if(hh > 12){
			hh = hh - 12;
		}
	}
	else{
		am = "AM";
		if(hh < 1){
			hh = 12;
		}
	}
	
	var mx = a.getMinutes();
	if(hh.toString().length == 1){
		hh = "0" + hh;
	}
	if(mx.toString().length == 1){
		mx = "0" + mx;
	}
	var m;
	switch(mm){
		case 0:
			m = "Jan";
		break;
		case 1:
			m = "Feb";
		break;
		case 2:
			m = "Mar";
		break;
		case 3:
			m = "Apr";
		break;
		case 4:
			m = "May";
		break;
		case 5:
			m = "Jun";
		break;
		case 6:
			m = "Jul";
		break;
		case 7:
			m = "Aug";
		break;
		case 8:
			m = "Sep";
		break;
		case 9:
			m = "Oct";
		break;
		case 10:
			m = "Nov";
		break;
		case 11:
			m = "Dec";
		break;
		default:
			m = "Jan";
	}
	var b = m + " " + dd + ", " + yyyy + " at " + hh + ":" + mx + " " +am;
	fn(b);
}

function loadUser(uid){
	var sql = "SELECT * FROM accounts WHERE username="+esc(uid);
	con.query(sql,function(err,result){
		if(err){
			return false;
		}
		else{
			if(result.length != 1){
				return false;
			}
			else{
				var sock = result[0].socket;
				if(sock == "" || sock == null || sock == "undefined"){
					return false;
				}
				else{
					var tm = Date.now();
					var diff = tm - Number(result[0].last_seen);
					if(diff > 1000000){
						return false;
					}
					else{
						io.to(sock).emit("user");
						return true;
					}
				}
			}
		}
	});
}

function dateFromTimestamp(ts,fn){
	var ee = Number(ts);
	var a = new Date(ee);
	var dd = a.getDate();
	var mm = a.getMonth();
	var yyyy = a.getFullYear();
	var hh = a.getHours();
	var am;
	if(hh > 11){
		am = "PM";
		if(hh > 12){
			hh = hh - 12;
		}
	}
	else{
		am = "AM";
		if(hh < 1){
			hh = 12;
		}
	}
	var mx = a.getMinutes();
	if(hh.toString().length == 1){
		hh = "0" + hh;
	}
	if(mx.toString().length == 1){
		mx = "0" + mx;
	}
	var m;
	switch(mm){
		case 0:
			m = "Jan";
		break;
		case 1:
			m = "Feb";
		break;
		case 2:
			m = "Mar";
		break;
		case 3:
			m = "Apr";
		break;
		case 4:
			m = "May";
		break;
		case 5:
			m = "Jun";
		break;
		case 6:
			m = "Jul";
		break;
		case 7:
			m = "Aug";
		break;
		case 8:
			m = "Sep";
		break;
		case 9:
			m = "Oct";
		break;
		case 10:
			m = "Nov";
		break;
		case 11:
			m = "Dec";
		break;
		default:
			m = "Jan";
	}
	var b = m + " " + dd + ", " + yyyy + " at " + hh + ":" + mx + " " +am;
	fn(b);
}

function send_mail(big){
	var html = '<!DOCTYPE html><html lang="en-US" xmlns="http://www.w3.org/1999/xhtml"><head><meta http-equiv="Content-type" content="text/html; charset=utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" /><meta http-equiv="X-UA-Compatible" content="IE=edge" /><meta name="format-detection" content="date=no" /><meta name="format-detection" content="address=no" /><meta name="format-detection" content="telephone=no" /><title>repoqedoevxrpajfzssqae</title><style type="text/css">*{box-sizing:border-box;word-spacing:5px;}body{margin:0px;padding:10px;background:#fff;font-family:"arial";}.header{width:100%;background:#eee;overflow:hidden;flex-direction:row;padding:30px;padding-left:10px}.header img{height:50px;width:auto;}.header span{display:block;margin:0px;padding:0px;font-weight:900;font-size:30px;letter-spacing:3px;color:#000;}.write{padding:10px;width:100%;margin:10px auto;max-width:700px;align:center;text-align:center;font-size:17px;font-weight:350;line-height:1.5;color:#111;letter-spacing:0.1px;}.write .heading{width:100%;font-size:25px;font-weight:500;line-height:1.2;color:#111;letter-spacing:0.1px;}.write .text{width:100%;font-size:17px;font-weight:350;line-height:1.5;color:#111;letter-spacing:0.1px;margin-bottom:10px;}.write .link{text-decoration:underline;color: #00a;font-weight:450;}.write .pic{width:100%;max-width:100%;margin-bottom:5px;}.write .block{display:block !important;}.wide{width:100%;}.write .btn{text-decoration:none;outline:none;display:inline-block;font-size:14px;padding:10px;border:none;font-weight:600;border-radius:2px;-moz-border-radius:2px;-webkit-border-radius:2px;-o-border-radius:2px;color:#fff;background:#333;line-height:1;}.panel{margin:20px;width:calc(100% - 40px);padding:5px;text-align:left;background:#fafafa;border-top:5px solid #eee;border-bottom:5px solid #eee;overflow:auto;}.footer{padding:20px;background:#eee;width:100%;color:#666;font-size:14px;font-weight:350;text-align:center;}</style></head><body><div class="header"><img src="reps1mmlb51zpfvfz0oxwk"><span>reptjirx4n66bi86m2flwe</span></div><div class="write">repr1xy75ou73wvfsmnof0</div><div class="footer">rep77dwajrbiyyhqak61jt &copy; repf2stldo6jx8p8ah8ueq.<br>all rights reserved.</div></body></html>';
	var title = big.title;
	var logo = site.addr + site.logo;
	var brand = "";
	var domain = site.domain;
	var body = big.body;
	var year = new Date();
	var year = year.getFullYear();
	var html = html.replace(/reps1mmlb51zpfvfz0oxwk/g,logo).replace(/reptjirx4n66bi86m2flwe/g,brand).replace(/rep77dwajrbiyyhqak61jt/g,domain).replace(/repf2stldo6jx8p8ah8ueq/g,year).replace(/repr1xy75ou73wvfsmnof0/g,body).replace(/repoqedoevxrpajfzssqae/g,title);
	var username = site.smtp.user;
	var host = site.smtp.host;
	var port = site.smtp.port;
	var password = site.smtp.pass;
	var frox = big.senderID + "@" + site.domain;
	var from = {name:big.sender,addres:frox};
	var to = big.to;
	if(typeof(to) == "array"){
		var to = to.join(",");
	}
	var transporter = nodemailer.createTransport({
		host:host,
		port:port,
		headers: {
			"x_priority":"1",
			"x-msmail-priority": "High",
			importance: "high"
		},
		auth: {
			user: username,
			pass: password
		}
	});
						
	var mailOptions = {
		from: frox,
		to: to,
		subject: title,
		html:html,
		replyTo:frox
	};
	transporter.sendMail(mailOptions, function(error, info){
		if (error) {
			//console.log(error);
			big.callback(error,false);
		} else {
			big.callback(false,true);
		}
	});		
}


function logging(tt){
	if(tt != ""){
		dateAndTime(async function(tm){
			if(site.mode == "prod"){
				var prefix = logdir + "_prod/";
				var delimiter = "/";
				var options = {
					prefix:prefix
				};
				if(delimiter != ""){
					options.delimiter = delimiter;
				}
				var files = await bucket.getFiles(options);
				if(isArray(files) && files[0].length > 0){
					axios.get("https://firebasestorage.googleapis.com/v0/b/"+bucket.name+"/o/"+logdir+"_prod%2F"+"log.txt?alt=media").then(function(response){
						if(response.status == 200){
							var data = response.data.toString();
							var txti = tm + " => " + tt + "\n\n\n";
							data += txti;
							bucket.file(logdir+"_prod/log.txt").delete().then(function(xx){
								var cc = Date.now() + ".txt";
								var strea = fs.createWriteStream(cc);
								strea.once('open',function(fd){
									strea.write(data);
									strea.end();
									bucket.upload(cc,{
										destination:logdir+'_prod/log.txt'
									}).then(function(dx){
										fs.unlinkSync(cc);
										return true;
									}).catch(function(err){
										fs.unlinkSync(cc);
										console.log(err);
										return false;
									});
								});

							}).catch(function(err){
								console.log(err);
								return false;
							});
						}
						else{
							return false;
						}
					}).catch(function(err){
						console.log(err);
						return false;
					});
				}
				else{
					fs.mkdir(logdir+"_prod",function(){
						var stream = fs.createWriteStream(logdir+"_prod/log.txt");
							stream.once('open',async function(fd){
							stream.write("LOG FILE CREATED ON "+tm+" \n\n\n");
							var txt = tm + " => " + tt + "\n\n\n";
							stream.write(txt);
							stream.end();
							var dirpath = logdir+"_prod/log.txt";
							bucket.upload(dirpath,{
								destination:dirpath,
								metadata:{
									cacheControl: 'no-cache'
								}
							}).then(function(rr){
								fs.unlink(logdir+"_prod/log.txt",function(err){
									fs.rmdirSync(logdir+"_prod");
									return true;
								});
							}).catch(function(err){
								console.log(err);
								fs.unlink(logdir+"_prod/log.txt",function(err){
									fs.rmdirSync(logdir+"_prod");
									return false;
								});
							});
						});
					});
				}
			}
			else{
				fs.stat(logdir+"/log.txt",function(err,stats){
					if(err){
						fs.stat(logdir,function(err,stats){
							if(err){
								fs.mkdir(logdir,function(){
									var stream = fs.createWriteStream(logdir+"/log.txt");
									stream.once('open',function(fd){
										stream.write("LOG FILE CREATED ON "+tm+" \n\n\n");
										var txt = tm + " => " + tt + "\n\n\n";
										stream.write(txt);
										stream.end();
									});
								})
							}
							else{
								var stream = fs.createWriteStream(logdir+"/log.txt");
								stream.once('open',function(fd){
								stream.write("LOG FILE CREATED ON "+tm+" \n\n\n");
								var txt = tm + " => " + tt + "\n\n\n";
								stream.write(txt);
								stream.end();
						});
							}
						});
					}
					else{
						var stream = fs.createWriteStream(logdir+"/log.txt",{flags:'a'});
						var txt = tm + " => " + tt + "\n\n\n";
						stream.write(txt);
						stream.end();
					}
				});
			}
		});
	}
	else{
		return false;
	}
}


function rawx(){
	var raw = ['0','1','2','3','4','5','6','7','8','9'];
	var id = raw[Math.floor(Math.random() * 10)] + raw[Math.floor(Math.random() * 10)] + raw[Math.floor(Math.random() * 10)] + raw[Math.floor(Math.random() * 10)] + raw[Math.floor(Math.random() * 10)] + raw[Math.floor(Math.random() * 10)] + raw[Math.floor(Math.random() * 10)] + raw[Math.floor(Math.random() * 10)] + raw[Math.floor(Math.random() * 10)] + raw[Math.floor(Math.random() * 10)];
	return id;
}


async function userID(fn){
	var stat = true;
	var idx;
	var stax;
	while(stat){
		var id = await rawx();
		var sta = await checkID(id);
		if(sta.err){
			stax = false;
			idx = "";
			stat = false;
		}
		else{
			if(sta.id == 0){
				if(id == site.default_id){

				}
				else{
					stax = true;
					idx = id;
					stat = false;
				}
			}
		}
	}
	if(stax){
		fn({succ:1,message:idx});
	}
	else{
		fn({err:1,message:"error generating user ID"});
	}
}

function regref(reg,fn){
	if(reg.ref){
		var sql = "SELECT * FROM users WHERE username="+esc(reg.ref)+" AND status='verified';";
		con.query(sql,function(err,result){
			if(err){
				devErr(err);
				fn({err:1,message:'server error... please try again'});
			}
			else{
				if(result.length == 1){
					fn({succ:1,message:reg.ref});
				}
				else{
					fn({err:1,message:'The Referral ID supplied does not exist or is invalid. Please supply a new one or leave the field empty to use the default ID'});
				}
			}
		});
	}
	else{
		fn({succ:1,message:site.default_id});
	}
}



function regsend(reg,fn){
	if(site.mode == "prod"){
		var sender = "admin";
		var senderID = "admin";
		var lin = site.addr + "/verify/" + reg.em + "/" + reg.refx;
		var title = "Account Verification";
		var body = '<div style="width:100%;text-align:left">'+
		'<p class="text">Your registration was successful. To verify your account, please click the button below</p><br><a class="btn" href="'+lin+'">Verify</a><br><br>'+
		'<p class="text">Or visit this link <small>'+lin+'</small><br><br>please do not share the link with other people<br><br>Please ignore this email if you did not register on '+site.domain+'</p>'+
		'</div>';
		send_mail({
			to:reg.em,
			body:body,
			sender:sender,
			senderID:senderID,
			title:title,
			callback:function(err,result){
				if(err){
					fn({err:1,message:"MAIL error... please try again"});
				}
				else{
					fn({succ:1});
				}
			}
		});
	}
	else{
		var str = "NEW REGISTRATION LINK "+site.addr+"/verify/"+reg.em+"/"+reg.refx;
		console.log(str);
		fn({succ:1});
	}
}


function userUp(user){
	var sql = "SELECT * FROM accounts WHERE userid="+esc(user)+";";
	con.query(sql,function(err,result){
		if(err){
			devErr(err);
			return false;
		}
		else{
			if(result.length != 1){
				return false;
			}
			else{
				var user = result[0];
				var ts = user.last_seen;
				var sid = user.socket;
				var t = Date.now();
				if(ts == null || ts == ""){
					return false;
				}
				else{
					var s = t - ts;
					if(s <= 1000000){
						io.to(sid).emit("user");
						return true;
					}
					else{
						return false;
					}
				}
			}
		}
	});
}

// function gm(){
// 	//this function transfers javascript's getmonth into a readable format;
// 	var m = new Date().getMonth();
// 	switch(m){
// 		case 0:
// 			return "January";
// 		break;
// 		case 1:
// 			return "February";
// 		break;
// 		case 2:
// 			return "March";
// 		break;
// 		case 3:
// 			return "April";
// 		break;
// 		case 4:
// 			return "May";
// 		break;
// 		case 5:
// 			return "June";
// 		break;
// 		case 6:
// 			return "July";
// 		break;
// 		case 7:
// 			return "August";
// 		break;
// 		case 8:
// 			return "September";
// 		break;
// 		case 9:
// 			return "October";
// 		break;
// 		case 10:
// 			return "November";
// 		break;
// 		case 11:
// 			return "December";
// 		break;
// 		default:
// 			return false;
// 	}
// }

function thumbnail(path,dim,callback){
	logging("reached thumbnail part");
	//path(string): the internal path of the image to be processed
	//dim(int): the length of the square thumbnail to replace the current image 
	//callback(function): function to be called when process is done or an error occured.
    var pth;
    if(path == "" || path == null){
		logging("failed to supply path");
        callback({err:1,message:'Path not supplied!'});
    }
    else{
		pth = site.addr + path;
		var arr = pth.split(".");
		var ext = arr[arr.length - 1];
		if(!/^jpg|jpeg|png|gif$/i.test(ext)){
			callback({err:1,message:'File type not supported!'});
		}
		else{
			var ex;
			if(/^jpg|jpeg$/i.test(ext)){
				ex = "jpg";
			}
			else{
				ex = ext;
			}
			request.post({url:site.phpServer,form:{path:pth,dim:dim,type:'thumbnail',ext:ex,token:site.phpToken}},function(err,httpResponse,body){
				if(!err && httpResponse.statusCode == 200){
					var bod;
					logging(body);
					try{
						bod = JSON.parse(body);
					}
					catch(err){
						bod = 0;
					}
					finally{
						if(bod == 0){
							callback({err:1,message:'Error parsing returned data!'});
						}
						else{
							var pa = bod.message;
							pa = pa.split("");
							pa.shift();
							pa.shift();
							pa = site.phpServer + pa.join("");
							var k = pa.split("/");
							k = k[k.length - 1];
							var strx = "./public/uploads/" + k;
							request.get(pa).on("response",function(resp){
								var stat = resp.statusCode;
								if(stat != 200){
									callback({err:1,message:'error fetching thumbnail!'});
								}
								else{
									request.post({url:site.phpServer,form:{path:bod.message,token:site.phpToken,type:'delete_thumbnail'}})
									callback({succ:1,message:path});
								}
							}).on("error",function(err){
								callback({err:1,message:'error fetching thumbnail.'});
							}).pipe(fs.createWriteStream(strx));
						}
					}
				}
				else{
					callback({err:1,message:'Could not establish connection with server!'});
				}
			});
		}
    }
}
