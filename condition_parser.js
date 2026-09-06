class ExprParser{
  constructor(src, functions = {}){this.functions=functions;this.src=String(src||'');this.pos=0;this.len=this.src.length;this.flags={};}
  parse(){this.ws();const v=this.or();this.ws();if(this.pos<this.len)throw new Error('无法解析："'+this.src.slice(this.pos)+'"');return v;}
  ws(){while(this.pos<this.len&&/\s/.test(this.src[this.pos]))this.pos++;}
  or(){let l=this.and();while(true){this.ws();if(this.src.startsWith('||',this.pos)){this.pos+=2;const r=this.and();l=l||r;}else break;}return l;}
  and(){let l=this.eq();while(true){this.ws();if(this.src.startsWith('&&',this.pos)){this.pos+=2;const r=this.eq();l=l&&r;}else break;}return l;}
  eq(){let l=this.rel();while(true){this.ws();if(this.src.startsWith('==',this.pos)){this.pos+=2;l=(l==this.rel());}else if(this.src.startsWith('!=',this.pos)){this.pos+=2;l=(l!=this.rel());}else break;}return l;}
  rel(){let l=this.add();while(true){this.ws();if(this.src.startsWith('>=',this.pos)){this.pos+=2;l=(l>=this.add());}else if(this.src.startsWith('<=',this.pos)){this.pos+=2;l=(l<=this.add());}else if(this.src.startsWith('>',this.pos)){this.pos+=1;l=(l>this.add());}else if(this.src.startsWith('<',this.pos)){this.pos+=1;l=(l<this.add());}else break;}return l;}
  add(){let l=this.mul();while(true){this.ws();const c=this.src[this.pos];if(c==='+'){this.pos++;l=l+this.mul();}else if(c==='-'){this.pos++;l=l-this.mul();}else break;}return l;}
  mul(){let l=this.unary();while(true){this.ws();const c=this.src[this.pos];if(c==='*'){this.pos++;l=l*this.unary();}else if(c==='/'||c==='%'){this.pos++;const r=this.unary();l=(c==='/')?(l/r):(l%r);}else break;}return l;}
  unary(){this.ws();const c=this.src[this.pos];if(c==='!'){this.pos++;return !this.unary();}if(c==='-'){this.pos++;return -this.unary();}return this.primary();}
  primary(){this.ws();const c=this.src[this.pos];
    if(c==='('){this.pos++;const v=this.or();this.ws();if(this.src[this.pos]!==')')throw new Error('缺少右括号');this.pos++;return v;}
    if(c==='"'||c==="'"){const q=c;this.pos++;let s='';while(this.pos<this.len&&this.src[this.pos]!==q){s+=this.src[this.pos];this.pos++;}
      if(this.src[this.pos]!==q)throw new Error('字符串未闭合');this.pos++;return s;}
    const num=this.src.slice(this.pos).match(/^(\d+(\.\d+)?|\.\d+)/);
    if(num){this.pos+=num[0].length;return parseFloat(num[0]);}
    const id=this.src.slice(this.pos).match(/^[\u4e00-\u9fa5A-Za-z_][\u4e00-\u9fa5A-Za-z0-9_]*/);
    if(id){
      this.pos+=id[0].length;const n=id[0];
      if(n==='true')return true;if(n==='false')return false;
      this.ws();
      if(this.src[this.pos]==='('){
        this.pos++;
        const args=[];
        this.ws();
        if(this.src[this.pos]===')'){this.pos++;}
        else{
          while(true){
            args.push(this.or());
            this.ws();
            const cc=this.src[this.pos];
            if(cc===','){this.pos++;continue;}
            if(cc===')'){this.pos++;break;}
            throw new Error('函数参数语法错误：'+n);
          }
        }
        const fn=Object.prototype.hasOwnProperty.call(this.functions,n)?this.functions[n]:null;
        if(typeof fn!=='function')throw new Error('未知条件函数：'+n);
        return fn.apply(null,args);
      }
      return Object.prototype.hasOwnProperty.call(this.flags,n)?Number(this.flags[n]):0;
    }
    throw new Error('无法解析："'+this.src.slice(this.pos)+'"');
  }
}

if(typeof module!=="undefined")module.exports={ExprParser};
