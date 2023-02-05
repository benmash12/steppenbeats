exports.newr = function(){
	var l = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z','0','1','2','3','4','5','6','7','8','9'];
	var ref = l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)];
	return ref;
}

exports.newAsync = function(fn){
	var l = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z','0','1','2','3','4','5','6','7','8','9'];
	var ref = l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)] + l[Math.floor(Math.random() * 36)];
	fn(ref);
}