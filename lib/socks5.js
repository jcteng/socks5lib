const { Duplex } = require('stream');
const ip = require("ip")
const CMD = {CONNECT:0x1,BIND:0x2,UDPASSOCIATE:0x3};
const REPLY = {
    SUCCESS: 0x00,
    GENFAIL: 0x01,
    DISALLOW: 0x02,
    NETUNREACH: 0x03,
    HOSTUNREACH: 0x04,
    CONNREFUSED: 0x05,
    TTLEXPIRED: 0x06,
    CMDUNSUPP: 0x07,
    ATYPUNSUPP: 0x08
};  
var BUFFER_EMPTY = Buffer.alloc(0)
function getATYPLength(data){
    let lengthMap = {1:3,3:data[1], 4:15}    
    return lengthMap[data[0]]
}
function getATYPAddr(data){
    let addrMap = {1:ip.toString(data.slice(1,5)),
                    3:data.slice(2,data[1]+2).toString(), 
                    4:ip.toString(data.slice(1,17))}                  
    return addrMap[data[0]]
}
function getATYPPort(data){
    let portMap = {1:5,3:data[1]+2,4:17}
    return data.readUInt16BE(portMap[data[0]])
}

class Socks5 extends Duplex {
      constructor(options) {
        super(options);  
        this.phase = 0
        this.CMD =CMD
        this.REPLY = REPLY
        this.dataBuf = Buffer.alloc(0)
        this.rfc1928Actions = {
            0:{expected:3,next:1,action:(data)=>{                          
                this.push(Buffer.from([5,0]))
                return 3;                
            }},
            1:{expected:5,next:2,action:(data)=>{                                
                this.rfc1928Actions[2].expected =5 + getATYPLength(data.slice(3)) +2                 
                return 0;
            }},
            2: {expected:0,next:3,action:(data)=>{//dynamic expected               
                this.emit("command",data[1],getATYPAddr(data.slice(3)),getATYPPort(data.slice(3)),data[3])
                return this.rfc1928Actions[2].expected;
            }},
            3: {expected:1,next:3,action:(data)=>{
                this.emit("error",new Error("found Data after command")) 
                return 0;
            }}
        }
    }
    _write(chunk, encoding, callback) {         
        this.dataBuf = Buffer.concat([this.dataBuf,chunk])
        while(this.dataBuf.length>=this.rfc1928Actions[this.phase].expected){
            if(this.dataBuf[0]!=0x5){
                console.log(this)
                console.log(this.dataBuf)
                this.emit("error",new Error("not socks v5 package"))
            }
            this.dataBuf = this.dataBuf.slice(this.rfc1928Actions[this.phase].action(this.dataBuf))
            this.phase = this.rfc1928Actions[this.phase].next            
        }
        callback()
    }    
    Reply(rep, addr, port) {
        let addrBuf = ip.toBuffer(addr);
        let ATYP = (addrBuf.length==4)?1:4;
        let headBuf = Buffer.from([5, rep, 0, ATYP]);    
        let portBuf = Buffer.alloc(2)
        portBuf.writeUInt16BE(port, 0);
        this.push( Buffer.concat([headBuf,addrBuf,portBuf]))
    }    
    Success (bindAddr,bindPort){        
        this.Reply(this.REPLY.SUCCESS,bindAddr,bindPort)
    }
    Failed (failtype=this.REPLY.GENFAIL){
        this.Reply(0,"0.0.0.0",0)
    }    
    _read(size){}
}
// 0xffff - (sizeof(IP Header) + sizeof(UDP Header)) -sizeof(socks5 header) = 65535-(20+8) = 65507 - 10
MAX_UDP_PACK_IPV4 = 65507-10
//0xffff - (sizeof(IP Header) + sizeof(UDP Header)) -sizeof(socks5 header)= 65535-(40+8) = 65487 - 22 
MAX_UDP_PACK_IPV6 = 65487-22

class Socks5UDP{
    constructor(max_pack_size=MAX_UDP_PACK_IPV6,onlyIPV4=false) {        
        if(max_pack_size>MAX_UDP_PACK_IPV4){
            throw Error("PACKAGE SIZE Not safe,MAX_UDP_PACK_IPV4 = 65497,MAX_UDP_PACK_IPV6= 65465")
        }
        if((max_pack_size>MAX_UDP_PACK_IPV6)&(!onlyIPV4)){
            throw Error("PACKAGE SIZE Not safe for IPV6")
        }
        this.max_pack_size = max_pack_size  
    }
    // return a list of fragments
    // if a call back provided,return fragments with callback
    UDP_pack(mesg,info,cb){
        let addrBuf = ip.toBuffer(info.address)
        let ATYP = (addrBuf.length==4)?1:4;
        let portBuf = Buffer.alloc(2)                
        portBuf.writeUInt16BE(info.port, 0);
        var datasize = mesg.length;
        let frag_H = parseInt(datasize/this.max_pack_size)
        let result = []

        for(var frag_L=0;frag_L<=frag_H;frag_L++){
            let headBuf = Buffer.from([0,0, (frag_H<<8)|frag_L,ATYP]);  
            if(cb){
                cb(Buffer.concat([headBuf,addrBuf,portBuf,mesg.slice(frag_L*this.max_pack_size)]))
            }
            else{
                result.push(Buffer.concat([headBuf,addrBuf,portBuf,mesg.slice(frag_L*this.max_pack_size)]))            
            }
        }        
        return result;        
    }
    //return with callback,while all fragments ready
    UDP_unpack(data,cb){      
        if(data.readUInt16BE(0)!=0){
            throw Error("wrong data found in socks5 package")
            return 
        }  
        var frag_H = data[2]>>8;
        var frag_L = 0xf&data[2];               
        if((frag_H!=this.frag_H)&&(this.fragments!=null)){
            this.fragments = null
            console.log("REASSEMBLY abandoned!!")
        }
        var addrlen = getATYPLength(data.slice(3))
        if(this.fragments==null){            
            this.fragments = [frag_H+1]
            this.unPackAddr = getATYPAddr(data.slice(3))
            this.unPackPort = data.readUInt16BE(addrlen+5)
            this.frag_H = frag_H
        }        
        this.fragments[frag_L] = (data.slice(addrlen+7))
        for(var i=0;i<=this.frag_H;i++){
            if(this.fragments==null)
                return 
        }
        var result = Buffer.concat(this.fragments)
        this.fragments = null
        cb(result,this.unPackAddr,this.unPackPort)        
    }
}
 
module.exports.Socks5 = Socks5
module.exports.Socks5UDP = Socks5UDP