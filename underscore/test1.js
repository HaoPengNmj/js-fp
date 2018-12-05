// js prototype  call 问题   http://www.cnblogs.com/yjf512/archive/2011/06/03/2071914.html

var obj={a:1,b:2};
toString.call(obj);
Object.prototype.toString.call(obj);
obj.toString();

var i=1;
toString.call(i);
i.toString();

[].toString.call([1,2]);
toString.call([1,2]); 


//typeof
 var obj =1;
 console.log(typeof obj);//typeof null  typeof undefined   typeof ""

 Array.prototype.slice.call(arguments);