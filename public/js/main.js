var userinterval;function userUp(){if(null!=username()&&/^[\d]{10}$/.test(username()))socket.emit("update_user_0r6fwdgyqushi",username(),function(e){e.succ&&(userinterval=setTimeout(userUp,6e4))});else try{"undefined"!=userinterval&&clearTimeout(userinterval)}catch(e){}}function visits(){$.ajax({type:"GET",url:"/visits",success:function(e){var s=e.split("#####"),a=s[0];tm=s[1];var r=new Date(parseInt(tm)),t=r.getDate(),e=r.getMonth()+1,s=r.getFullYear(),c=t+"/"+e+"/"+s;checkForStorage()&&(null!=(r=localStorage.getItem("visits"))&&r==c||socket.emit("count_visit_30r9u8hgyb4392832",a,t,e,s,function(e){e.succ&&localStorage.setItem("visits",c)}))}})}function menux(){$("#nav").toggleClass("active"),$("#menu-btn").children().first().toggleClass("fa-navicon").toggleClass("fa-close"),$("body").toggleClass("bodylock")}function scrollCat(){var e=document.getElementById("categories"),s=e.offsetWidth||e.clientWidth,a=e.scrollWidth,r=e.scrollLeft,s=a-r-s;e.scrollLeft=r<110||0!=s?r+110:0}function searchInit(){$("#searchbar,#searchclose").addClass("active"),$("#searchres").fadeIn(250),$("body").addClass("bodystop"),$("#searchbar").val(""),$("#searchres").html(""),$("#searchbar").focus()}function searchx(e){var a;""!=e&&(e.replace(/\s/g,"").length<3?$("#searchres").html('<p id="searchins">Type up to three non-space characters to activate live search.</p>'):(e=e.replace(/[\n|\n\r|\t]/," "),a=entities(e),null==(e=(e=e.replace(/[\-|\.|,]/g," ").replace(/["|'|\|]/g,"")).match(/\b[\w]{1,}\b/g))?$("#searchres").html('<p id="searchins"><i class="fa fa-warning"></i> No results found for \''+a+"', Try other keywords please.</p>"):(e=e.join("|"),$("#searchres").html('<p id="searchins"><i class="fa fa-spinner fa-pulse"></i> loading results for \''+a+"'.</p>"),socket.emit("main_search",e,function(e){var s;e.succ?e.products.length+e.genres.length<1?$("#searchres").html('<p id="searchins"><i class="fa fa-warning"></i> No results found for \''+a+"', Try other keywords please.</p>"):(s=[],0<e.genres.length&&e.genres.forEach(function(e){e='<a href="/genre/'+e.id+"/"+sanitize(e.genre)+'/all" class="searchrex dark-green"><span class="light-green thick">'+e.genre+'</span> <span class="dark-green">in Genres.</span></a>';s.push(e)}),0<e.products.length&&e.products.forEach(function(e){e='<a href="/item/'+e.id+"/"+sanitize(e.genre)+"-"+sanitize(e.category)+"/"+sanitize(e.title)+'" class="searchrex dark-green"><span class="light-green thick">'+e.title+'</span> <span class="dark-green">in '+e.category+"s.</span></a>";s.push(e)}),e='<h3 id="searchhead" class="dark-green">Search Results('+(e.products.length+e.genres.length)+")</h3>",$("#searchres").html(e+s.join(""))):$("#searchres").html('<p id="searchins"><i class="fa fa-warning"></i> Search Failed! an error was encountered.</p>')}))))}function cookx(){checkForStorage()&&null==localStorage.getItem("cookxx")&&(note("Note that this site uses cookies. Please accept cookies to enable it offer you the best experience. Thank you for your understanding!",0),localStorage.setItem("cookxx","shown"))}function searchEnd(){""==$("#searchbar").val()?($("#searchbar,#searchclose").removeClass("active"),$("#searchres").fadeOut(250),$("body").removeClass("bodystop")):($("#searchbar").val(""),$("#searchres").html("<p id=\"searchins\">Search cleared! you can search again or click the 'x' button again to exit search.</p>"),$("#searchbar").focus())}function loadMore(e){$(e).blur();var s=reserved.length;if(0==s)Info("no more items to fetch!");else{var a=[];for(i=0;i<s&&i!=fl;i++){var r=parseProduct(reserved.shift());a.push(r)}$("#productxxx").append(a.join(""))}}function parseProduct(e){var s='<div class="product" name="product"><div name="product image" style=" background-image:url(\''+e.picture+'\')" class="product-img img-bg"></div><div class="product-det"><p name="product title" class="product-title green">'+e.title+'</p><p name="product desc" class="product-desc light-black">'+e.genre+" "+e.category;return"Beat"==e.category&&(s+=" | "+e.tempo+"BPM"),s+='</p><p name="product price" class="product-price green">',0==e.price?s+="Free":0==e.discount?s+=cur.sym+cash(e.price):s+=cur.sym+cashx(e.price,e.discount)+'<span class="strike dark-red"><strike>'+cur.sym+cash(e.price)+"</strike> (-"+e.discount+"%)</span>",s+="</p><div>",s+='<button onclick="play('+e.id+')" class="product-play dark-green-bg green black-out"><i class="fa fa-play"></i></button><button onclick="addToCart('+e.id+')" class="product-cart dark-green-bg green black-out"><i class="fa fa-cart-plus"></i></button><button onclick="link(\'/item/'+e.id+"/"+sanitize(e.genre)+"-"+sanitize(e.category)+"/"+sanitize(e.title)+'\')" class="product-cart dark-green-bg green black-out"><i class="fa fa-link"></i></button></div></div></div>'}function cashx(e,s){s=parseInt(s),e=parseFloat(e),s=e-e*(s/100);return null==s?"0.00":num(s.toFixed(2))}$(document).ready(function(){visits(),userUp()});