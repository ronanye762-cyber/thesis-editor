const {route}=require('../src/router');
module.exports=async function handler(req,res){await route(req,res);};
