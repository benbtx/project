import BaseWidget = require('core/BaseWidget.class');
import Functions =require('core/Functions.module');
export = VehicleRefuelingRecordInfo;

class VehicleRefuelingRecordInfo extends BaseWidget {
    baseClass = "widget-VehicleRefuelingRecordInfo";
    toast = null;
    popup = null;
    loadWait=null;
    currentPopup=null;
    editlabel="add";//默认状态是添加add，编辑edit
    carid="";
    depid="";
    start_date="";
    end_date="";
    keyword = "";
    select_info={
        datas:[],
        ids:[],
        id:"",
        currentTarget:null
    };
    companyid = "";//公司id
    iszgs=false;//是否是总公司账号  
    ispartment=false;//是否为部门账号

    /**
     * @function 启动功能页面
     */
    startup() {
        this.configure();
        this.initHtml();
        this.initEvent();
        this.initLoginUser();
    }

    /**
     * @function 配置初始化
     */
    configure() {
        this.toast = this.AppX.runtimeConfig.toast;
        this.popup = this.AppX.runtimeConfig.popup;
        this.loadWait=this.AppX.runtimeConfig.loadWait;
    }

    /**
     * @function 页面初始化
     */
    initHtml() {
        var html = _.template(this.template.split('$$')[0] + "</div>")();
        this.setHtml(html);
        this.ready();        
    }

    /**
     * @function 判断是否为集团账号或子公司账号
     */
    initCompany(){
        if(AppX.appConfig.groupid!=null && AppX.appConfig.groupid!=""){
            this.ispartment=true;
        }
        
        if(this.ispartment==false){
            if(AppX.appConfig.range.indexOf(";")>-1){
                var codes=AppX.appConfig.range.split(";");
                if(codes!=null && codes.length>0){
                    for(var i=0;i<codes.length;i++){
                        if(codes[i]==this.config.rangeall){
                            this.iszgs=true;
                            break;
                        }
                    }
                }  
            }else{
                if(AppX.appConfig.range==this.config.rangeall){
                    this.iszgs=true;
                }
            } 
        }       
    }

     /**
     * @function 根据不同账号获取headers
     * @param type 0获取自己及以下部门数据，1获取自身数据
     */
    getHeaders(type?:number){
        var headers=null;
        switch(type){
            case 0:
                headers={                
                    'Token': AppX.appConfig.xjxj,
                    'departmentid': AppX.appConfig.departmentid,
                    'range':AppX.appConfig.range
                };
                break;
            case 1:
                headers={                
                    'Token': AppX.appConfig.xjxj,
                    'departmentid': AppX.appConfig.departmentid
                };
                break;
            default:
                headers={                
                    'Token': AppX.appConfig.xjxj,
                    'departmentid': AppX.appConfig.departmentid
                };
                break;
        }
        return headers;
    }

    /**
     * @function 根据登录账号（集团公司账号、子公司账号、部门账号）初始化
     */
    initLoginUser(){           
        this.initCompany(); 
        this.initTimeControl();                   
        if(this.iszgs==true){//集团公司账号 
            this.domObj.find(".company_serch").show();           
            this.getCompanyList();
            this.domObj.find('.company').on("change", function () {  
                this.companyid=this.domObj.find(".company option:selected").val();      
                this.setUserControl(this.companyid);       
                this.getGroup("department",this.domObj,true);//部门
                this.depid="";
                this.getCarList(this.domObj,true,"carids");//车辆信息列表 
                this.setSearchVal("","","",""); 
                this.getVehicleRefuelingRecord();       
            }.bind(this));  
        }else{
            this.domObj.find(".company_serch").hide();
            if(this.ispartment){
                this.depid=AppX.appConfig.groupid;//获取部门id
                this.domObj.find(".department_btn").hide();
            }else{
                this.depid="";
                this.getGroup("department",this.domObj,true);//部门                 
            }            
            this.getCarList(this.domObj,true,"carids");//车辆信息列表  
            this.getVehicleRefuelingRecord();                
        }
    } 

    /**
     * @function 控件是否可用
     * @param companyid 公司id
     */
    setUserControl(companyid){
        if(AppX.appConfig.departmentid==companyid){//可进行编辑操作
            this.domObj.find('.btn_add').prop("disabled",false);
            this.domObj.find('.btn_edit').prop("disabled",false);
            this.domObj.find('.btn_delete').prop("disabled",false);
        }else{
            this.domObj.find('.btn_add').prop("disabled",true);
            this.domObj.find('.btn_edit').prop("disabled",true);
            this.domObj.find('.btn_delete').prop("disabled",true);
        }
    } 

    /**
     * @function 获取公司列表信息
     */
    getCompanyList() {
        $.ajax({           
            type: "POST",
            url: AppX.appConfig.xjapiroot.replace(/\/+$/, "") + this.config.getCompanyList,            
            success: function(results){                
                var that = this;
                if (results.code != 1) {
                    that.toast.Show(results.message);
                    return;
                }
                var strdepartment = "";//"<option value=''>全部</option>";
                $.each(results.result, function (index, item) {                    
                    if(AppX.appConfig.departmentid==item.companyid){
                        strdepartment += "<option selected value='" + item.companyid + "'>" + item.company_name + "</option>";
                    }else{
                        strdepartment += "<option value='" + item.companyid + "'>" + item.company_name + "</option>";
                    }   
                }.bind(this));
                this.domObj.find(".company").empty().append(strdepartment);
                this.companyid=this.domObj.find(".company option:selected").val();
                this.getGroup("department",this.domObj,true);//部门列表 
                this.depid="";
                this.getCarList(this.domObj,true,"carids");//车辆信息列表                
                this.config.currentpage=1;     
                this.setSearchVal("","","","");   
                this.getVehicleRefuelingRecord();          
            }.bind(this),
            error: function (data) {
                this.toast.Show("服务端ajax出错，获取公司列表数据失败!");
            }.bind(this),
            dataType: "json",
        });
    }

    start = {
            format: 'YYYY-MM-DD',           
            isinitVal:false,
            choosefun: function(elem, val, date){
                var dt=new Date(val.replace(/-/g,"/"));
                this.end.minDate=Functions.DateFormat(dt,"yyyy-MM-dd");             
                this.domObj.find('.end_date').val(this.end.minDate);
            }.bind(this)
        };

    end = {
        format: 'YYYY-MM-DD', //日期格式  
        isinitVal: false,
        minDate:Functions.DateFormat(new Date(),"yyyy-MM-dd")
    };

    /**
     * @function 弹出框初始化时间控件
     */
    initTimeControl(){
         $.jeDate(".fuel_date",{
            format: 'YYYY-MM-DD',   
            isinitVal: true
        });
        $.jeDate(".start_date",this.start);
        $.jeDate(".end_date",this.end);       
    }  

    /**
     * @function 设置查询条件
     * @param depid 部门id
     * @param carid 车辆id
     * @param start_date 开始日期
     * @param end_date 结束日期
     */
    setSearchVal(depid,carid,start_date,end_date){
        if(this.ispartment==false)
            this.depid=depid;
        this.carid=carid;
        this.start_date=start_date;
        this.end_date=end_date;
    } 

    /**
     * @function 事件初始化
     */
    initEvent() {
        var that=this;
         this.domObj.find('.department').off("change").on("change", function () {  
            this.depid=this.domObj.find(".department option:selected").val();
            this.getCarList(this.domObj,true,"carids");//车辆信息列表            
        }.bind(this)); 

        //查询 click
        this.domObj.find('.btn_search').on("click", function () {           
            this.config.currentpage=1;
            this.setSearchVal(this.domObj.find(".department option:selected").val(),this.domObj.find(".carids option:selected").val(),this.domObj.find(".start_date").val(),this.domObj.find(".end_date").val());
            this.getVehicleRefuelingRecord();
        }.bind(this));

        //刷新 click
        this.domObj.find('.btn_refresh').on("click", function () {
            this.config.currentpage=1;     
             this.setSearchVal("","","","");   
            this.getVehicleRefuelingRecord();
        }.bind(this));

        //登记 click
        this.domObj.find('.btn_add').on("click", function () {
            this.editlabel="add";
           this.showInfo(null,"新增",1);                 
        }.bind(this));

        //更新 click
        this.domObj.find('.btn_edit').on("click", function () {
            var that=this;
            if (this.select_info.currentTarget == null) {
                this.toast.Show("请选择加油记录信息！");
                return;
            }
            this.editlabel="edit";
           this.showInfo(this.select_info.currentTarget,"修改",2);
        }.bind(this));          

        //删除 click
        this.domObj.find('.btn_delete').on("click", function () {
            if (this.select_info.ids.length==0) {
                this.toast.Show("请选择加油记录信息！");
                return;
            }

            this.popup.setSize(this.config.popuptip.width, this.config.popuptip.height);
            var Obj = this.popup.ShowMessage("提示", "是否删除选择数据？");
            Obj.submitObj.off("click").on("click", function () {
                this.popup.Close();
                $.ajax({
                    headers: this.getHeaders(1),
                    type: "POST",
                    dataType: "json",
                    url: AppX.appConfig.xjapiroot.replace(/\/+$/, "") + this.config.deleteCarFuelCharging,
                    data: {
                        "list": this.select_info.ids
                    },
                    success: function(results){
                        if (results.code != 1) {
                            this.toast.Show(results.message);
                            return;
                        }                        
                        this.toast.Show(this.config.messages.delete);
                        this.config.currentpage=1;
                        this.getVehicleRefuelingRecord();
                    }.bind(this),
                    error: function (data) {
                        this.toast.Show(this.config.messages.delete);
                    }.bind(this)                    
                });
            }.bind(this));            
        }.bind(this));


        // 选中行高亮 click
        this.domObj.off("click").on('click', 'tbody tr', (e) => {
            if ($(e.currentTarget).data("id") == null) {
                return;
            } else {
                this.select_info.currentTarget = $(e.currentTarget);                              
            }
            this.domObj.find('tr.active').removeClass('active');
            $(e.currentTarget).addClass('active');
        });

        //上一页
        this.domObj.find(".pre").off("click").on("click", function () {
            if (this.config.currentpage - 1 > 0) {
                this.config.currentpage = this.config.currentpage - 1;
                this.getVehicleRefuelingRecord();
            }
        }.bind(this));

        //下一页
        this.domObj.find(".next").off("click").on("click", function () {
            if (this.config.currentpage + 1 <= this.config.pagenumber) {
                this.config.currentpage = this.config.currentpage + 1;
                this.getVehicleRefuelingRecord();
            }
        }.bind(this));

        //返回
        this.domObj.find(".pageturning").off("click").on("click", function () {
            var currpage = parseInt(this.domObj.find(".currpage").val());
            if (currpage <= this.config.pagenumber && currpage >= 1) {
                this.config.currentpage = parseInt(this.domObj.find(".currpage").val());
                this.getVehicleRefuelingRecord();
            }
        }.bind(this));

        //默认页条数修改
        this.domObj.find(".dynamic_pagesize").off("change").on("change", function () {
            this.config.pagesize= parseInt(this.domObj.find(".dynamic_pagesize option:selected").val());            
            this.getVehicleRefuelingRecord();           
        }.bind(this));

        //全选
        this.domObj.find('.select_refuleling_all_list').off("change").on("change", function () {
            if (this.domObj.find(".select_refuleling_all_list").prop('checked') == true) {
                this.domObj.find(".select_refuleling_list").each(function () {                    
                    $(this).prop('checked', true);
                    that.removeOrAddSelectItem(true,$(this));
                });
            } else {
                this.domObj.find(".select_refuleling_list").each(function () {
                    $(this).prop('checked', false);
                    that.removeOrAddSelectItem(false,$(this));
                });
            }
        }.bind(that));       
    }

    /**
     * @function 获取加油记录信息列表
     */
    getVehicleRefuelingRecord() {   
        this.loadWait.Show("正在查询数据，请耐心等待...",this.domObj);    
        this.select_info={
            datas:[],
            ids:[],
            id:"",
            currentTarget:null
        };  
        this.domObj.find('.select_refuleling_all_list').prop("checked",false);
        $.ajax({
            headers: this.getHeaders(0),
            type: "POST",
            dataType: "json",
            url: AppX.appConfig.xjapiroot.replace(/\/+$/, "") + this.config.getCarFuelChargingList,
            data: {
                "pageindex": this.config.currentpage,
                "pagesize": this.config.pagesize,
                "carid": this.carid,
                "companyid":this.companyid,
                "fuel_date_start":this.start_date,
                "fuel_date_end":this.end_date,
                "departmentid":this.depid
            },
            success: this.getVehicleRefuelingRecordListCallback.bind(this),
            error: function (data) {
                this.loadWait.Hide();
                this.toast.Show(this.config.messages.other);
            }.bind(this)
        });
    }
    getVehicleRefuelingRecordListCallback(results) {
        this.loadWait.Hide();     
        var that = this;
        if (results.code != 1) {
            that.toast.Show(results.message);
            return;
        }
        if (results.result.total % this.config.pagesize == 0) {
            this.config.pagenumber = Math.floor(parseInt(results.result.total) / parseInt(this.config.pagesize));
        } else {
            this.config.pagenumber = Math.floor(parseInt(results.result.total) / parseInt(this.config.pagesize)) + 1;
        }

        //为分页控件添加信息
        this.domObj.find(".pagecontrol").text("总共" + results.result.total + "条，每页");
        this.domObj.find(".content").text("第" + that.config.currentpage + "页共" + that.config.pagenumber + "页");
        this.domObj.find(".selectpagecontrol").text("，当前选中"+this.select_info.datas.length+"条");
        if (this.config.pagenumber == 0) {
            this.domObj.find(".pagecontrol").text("总共-条，每页-条");
            this.domObj.find(".content").text("第-页共-页");
            this.domObj.find(".selectpagecontrol").text("，当前选中-条");
        }
        var html_trs_data = "";
        $.each(results.result.rows, function (i, item) {
            var fuel_date= (item.fuel_date!=null &&item.fuel_date!=""?Functions.DateFormat(new Date(item.fuel_date.replace(/-/g,"/")),"yyyy-MM-dd"):"");
            html_trs_data += "<tr class=goto  data-id='" + item.id
             + "' data-fuel_date='" + fuel_date 
             + "' data-carid='" + item.carid
             + "' data-car='" + item.car
             + "' data-fuel_userid='" + item.fuel_userid 
             + "' data-fuel_type_id='" + item.fuel_type_id
             + "' data-total_price='" + item.total_price
             + "' data-unit_price='" + item.unit_price
             + "' data-fuel_num='" + item.fuel_num
             + "' data-pay_type_id='" + item.pay_type_id
             + "' data-depid='" + item.depid
             + "' data-fuel_card_id='" + item.fuel_card_id
             + "' data-gas_station='" + item.gas_station
             + "' data-table_mileage='" + item.table_mileage
             + "' data-notes='" + item.notes
             + "'><td class='checkwidth'><input type='checkbox' class='select_refuleling_list' data-id='" + item.id
             + "' data-fuel_date='" + fuel_date 
             + "' data-carid='" + item.carid
             + "' data-fuel_userid='" + item.fuel_userid 
             + "' data-fuel_type_id='" + item.fuel_type_id
             + "' data-total_price='" + item.total_price
             + "' data-unit_price='" + item.unit_price
             + "' data-fuel_num='" + item.fuel_num
             + "' data-pay_type_id='" + item.pay_type_id
             + "' data-depid='" + item.depid
             + "' data-fuel_card_id='" + item.fuel_card_id
             + "' data-gas_station='" + item.gas_station
             + "' data-table_mileage='" + item.table_mileage
             + "' data-notes='" + item.notes 
             +"'/></td><td title='"+item.dept+"'>" + item.dept + "</td><td title='"+item.car+"'>" 
             + item.car + "</td><td title='"+item.fuel_user+"'>" 
             + item.fuel_user + "</td><td title='"+fuel_date+"'>" 
             + fuel_date + "</td><td title='"+item.fuel_num+"'>"
             + item.fuel_num + "</td><td title='"+item.total_price+"'>" 
             + item.total_price + "</td><td title='"+item.unit_price+"'>" 
             + item.unit_price + "</td><td title='"+item.table_mileage+"'>"
             + item.table_mileage + "</td><td title='"+item.gas_station+"'>"
             + item.gas_station              
             + "</td><td><a class='operation' data-id='" + item.id
             + "' data-fuel_date='" + fuel_date 
             + "' data-carid='" + item.carid
             + "' data-car='" + item.car
             + "' data-fuel_userid='" + item.fuel_userid 
             + "' data-fuel_type_id='" + item.fuel_type_id
             + "' data-total_price='" + item.total_price
             + "' data-unit_price='" + item.unit_price
             + "' data-fuel_num='" + item.fuel_num
             + "' data-pay_type_id='" + item.pay_type_id
             + "' data-depid='" + item.depid
             + "' data-fuel_card_id='" + item.fuel_card_id
             + "' data-gas_station='" + item.gas_station
             + "' data-table_mileage='" + item.table_mileage
             + "' data-notes='" + item.notes 
             +"'>查看详细</a></td></tr>";           
        }.bind(this));
        this.domObj.find(".refulelinglist").empty().append(html_trs_data);   
        
        //查看详细
        this.domObj.find(".operation").off("click").on("click", function (e) { 
            this.select_info.currentTarget=$(e.currentTarget); 
            this.editlabel="detail";                        
            this.showInfo($(e.currentTarget),"查看详细",3);
        }.bind(that)); 

        //勾选
        this.domObj.find('.select_refuleling_list').off("change").on("change",function(e){  
            this.removeOrAddSelectItem(e.currentTarget.checked,$(e.currentTarget));
        }.bind(that));    
    }   

    /**
     * @function 显示当前数据，可编辑，添加
     * @param target 对象
     * @param idx
     */
    showInfo(target,tit,idx){
        this.popup.setSize(this.config.popupsize.width, this.config.popupsize.height);
        var Obj = (this.editlabel=="detail"?this.popup.Show(tit, this.template.split('$$')[idx],true):this.popup.Show(tit, this.template.split('$$')[idx]));              
        this.currentPopup=Obj;
        var id="";
        if(target!=null){
            id=target.data("id");
            Obj.conObj.find('.fuel_date').val(target.data("fuel_date"));
            //Obj.conObj.find('.carid').val(target.data("carid"));
            Obj.conObj.find('.total_price').val(target.data("total_price"));
            Obj.conObj.find('.unit_price').val(target.data("unit_price"));
            Obj.conObj.find('.fuel_num').val(target.data("fuel_num"));
            Obj.conObj.find('.fuel_card_id').val(target.data("fuel_card_id"));
            Obj.conObj.find('.gas_station').val(target.data("gas_station"));
            Obj.conObj.find('.table_mileage').val(target.data("table_mileage"));
            Obj.conObj.find('.notes').val(target.data("notes"));                    
        }
        this.getCarList(Obj.conObj,false,"carid");
        this.getSysConfig(this.config.fueltypekey,"fuel_type_id",Obj.conObj,false);
        this.getSysConfig(this.config.paytypekey,"pay_type_id",Obj.conObj,false);
        this.getUser();
        this.initTimeControl();
       
        (<any>$('#widget-VehicleDriverBaseInfoManagement_addpopup')).bootstrapValidator();
        //提交保存
        Obj.submitObj.off("click").on("click", function () {                
                var fuel_date = Obj.conObj.find('.fuel_date'); 
                var total_price = Obj.conObj.find('.total_price');
                var unit_price = Obj.conObj.find('.unit_price'); 
                var fuel_num = Obj.conObj.find('.fuel_num');  
                var pay_type_id = Obj.conObj.find('.pay_type_id option:selected');                                     
                var fuel_card_id = Obj.conObj.find('.fuel_card_id');
                if (fuel_date.val() == '') {
                    fuel_date.addClass('has-error');                       
                    this.popup.ShowTip("加油日期不能为空！");
                    return;
                } 
                 if (total_price.val() == '') {
                    total_price.addClass('has-error');                       
                    this.popup.ShowTip("总价不能为空！");
                    return;
                } 
                if (unit_price.val() == '') {
                    unit_price.addClass('has-error');                       
                    this.popup.ShowTip("单价不能为空！");
                    return;
                } 
                if (fuel_num.val() == '') {
                    fuel_num.addClass('has-error');                       
                    this.popup.ShowTip("数量不能为空！");
                    return;
                } 

                if (pay_type_id.text()=="加油卡"&&fuel_card_id.val() == '') {
                    fuel_card_id.addClass('has-error');                       
                    this.popup.ShowTip("加油卡卡号不能为空！");
                    return;
                }
                
                $.ajax({
                    headers: {              
                        'Token': AppX.appConfig.xjxj,
                        'departmentid': AppX.appConfig.departmentid
                    },
                    type: "POST",
                    dataType: "json",
                    url: AppX.appConfig.xjapiroot.replace(/\/+$/, "") + (this.editlabel=="add"?this.config.addCarFuelCharging:this.config.updateCarFuelCharging),
                    data: {
                        "id":id,
                        "carid":Obj.conObj.find('.carid option:selected').val(),
                        "fuel_userid":Obj.conObj.find('.fuel_userid option:selected').val(),
                        "fuel_date":Obj.conObj.find('.fuel_date').val(),
                        "total_price":Obj.conObj.find('.total_price').val(),
                        "unit_price":Obj.conObj.find('.unit_price').val(),
                        "fuel_num":Obj.conObj.find('.fuel_num').val(),
                        "fuel_card_id":Obj.conObj.find('.fuel_card_id').val(),
                        "gas_station":Obj.conObj.find('.gas_station').val(),
                        "table_mileage":Obj.conObj.find('.table_mileage').val(),
                        "fuel_type_id":Obj.conObj.find('.fuel_type_id').val(),
                        "pay_type_id":Obj.conObj.find('.pay_type_id').val(),
                        "notes":Obj.conObj.find('.notes').val()
                    },
                    success: function(results){                        
                        console.log(results.message);
                        if(results.code!=1){
                            this.popup.ShowTip(results.message);
                            return;
                        }
                        this.popup.Close();
                        this.toast.Show(this.editlabel=="add"?this.config.messages.add:this.config.messages.update);
                        this.getVehicleRefuelingRecord(); 
                    }.bind(this),
                    error: function (data) {
                         this.popup.ShowTip(this.config.messages.other);
                    }.bind(this)
                });                            
        }.bind(this));                             
    }

    /**----------------------------字典获取------------------------- */
    /**
     * @function 获取车辆列表
     * @param domObj
     * @param isall
     * @param controlname
     */
    getCarList(domObj,isall,controlname){
        $.ajax({
                headers: this.getHeaders(0),
                type: "POST",                
                dataType: "json",
                url: AppX.appConfig.xjapiroot.replace(/\/+$/, "") + this.config.getVehicleList,
                data: {
                    "pageindex": 1,
                    "pagesize": this.config.maxsize,
                    "companyid":this.companyid,
                    "depid":this.depid
                },
                success: function (result) {
                    if (result.code != 1) {
                        this.toast.Show(result.message);
                        return;
                    }
                    var stroption ="<option value=''>全部</option>";
                    if(isall==false){
                        stroption="";
                    }
                    result.result.rows.forEach(function (row) {
                         if(this.select_info.currentTarget!=null && this.select_info.currentTarget.data("carid")==row.id && (this.editlabel=="edit"||this.editlabel=="detail")){//编辑状态
                            stroption += "<option selected='selected' value='" + row.id + "'>" + row.plate_number + "</option>";
                        }else{
                            stroption += "<option value='" + row.id + "'>" + row.plate_number + "</option>";
                        }                                            
                    }.bind(this));
                    domObj.find('.'+controlname).empty().append(stroption);
                }.bind(this),
                error: function (data) {
                    this.popup.ShowTip(this.config.messages.other);
                }.bind(this)
            });
    } 

    /**
     * @function 获取部门列表
     * @param selectClass
     * @param domObj
     * @param isall
     */
    getGroup(selectClass,domObj,isall) {
        $.ajax({
            headers: this.getHeaders(0),
            type: "POST",
            dataType: "json",
            url: AppX.appConfig.xjapiroot.replace(/\/+$/, "") + this.config.getGroupList,
            data: {
                "pageindex": 1,
                "pagesize": this.config.maxsize,
                "companyid":this.companyid
            },
            success: function(results){
                var that = this;
                if (results.code != 1) {
                    that.toast.Show(results.message);
                    return;
                }
                var strdepartment = "<option value='' selected>全部</option>";
                if(isall==false){
                    strdepartment="";
                }
                $.each(results.result.rows, function (index, item) {                    
                    strdepartment += "<option value='" + item.id + "'>" + item.name + "</option>";                    
                }.bind(this));
                domObj.find("."+selectClass).empty().append(strdepartment);
            }.bind(this),
            error: function (data) {
                this.toast.Show(this.config.messages.other);
            }.bind(this)
        });
    }
   

    /**
     * @function 根据部门id获取用户列表，空代表查询全部
     * @param depid 部门id
     */
    getUser() {
        $.ajax({
            headers:this.getHeaders(1),
            type: "POST",
            dataType: "json",
            url: AppX.appConfig.xjapiroot.replace(/\/+$/, "") + this.config.getUserList,
            data: {
                "pageindex": 1,
                "pagesize": this.config.maxsize
            },
            success: this.getUserListCallback.bind(this),
            error: function (data) {
                this.toast.Show(this.config.messages.other);
            }.bind(this)
        });
    }
    getUserListCallback(results) {
        var that = this;
        if (results.code != 1) {
            that.toast.Show(results.message);
            return;
        }
        var strusers = "";
        $.each(results.result.rows, function (index, item) {
            if(this.select_info.currentTarget!=null && this.select_info.currentTarget.data("fuel_userid")==item.userid && (this.editlabel=="edit"||this.editlabel=="detail")){
                strusers += "<option selected value=" + item.userid + " > " + item.username + " </option>";
            }else{
                strusers += "<option value=" + item.userid + " > " + item.username + " </option>";
            }            
        }.bind(this));
        this.currentPopup.conObj.find(".fuel_userid").empty().append(strusers);
    }   

   

    /**
     * @function 添加或删除选中集合
     * @param ischecked 
     * @param currentTarget
     */
    removeOrAddSelectItem(ischecked,currentTarget){
        var item={ 
                "id": currentTarget.data('id')              
            };
        if (ischecked){//添加
              var isExist=0;
              for(var i=0;i<this.select_info.datas.length;i++){
                var arrSid=this.select_info.datas[i];
                if(arrSid.id==item.id){
                    isExist=1;
                    break;
                }
            }
            if(isExist==0){
                this.select_info.datas.push(item);
                this.select_info.ids.push(item.id);
            }
                
         }else{//取消
            var arrSids=[],ids=[];
            for(var i=0;i<this.select_info.datas.length;i++){
                var arrSid=this.select_info.datas[i];
                if(arrSid.id!=item.id){
                    ids.push(arrSid.id);
                    arrSids.push(arrSid);
                }
            }
           this.select_info.datas=arrSids;
           this.select_info.ids=ids;
        }
        this.domObj.find(".selectpagecontrol").text("，当前选中"+this.select_info.datas.length+"条");
    } 
   
    /**
     * @function 获取区域类型、执行方式
     * @param key
     * @param controlname
     * @param domObj
     * @param isall
     */
    getSysConfig(key,controlname,domObj,isall){
        $.ajax({
                headers: this.getHeaders(1),
                type: "POST",                
                dataType: "json",
                url: AppX.appConfig.xjapiroot.replace(/\/+$/, "") + this.config.getConfigList,
                data: {
                    "pageindex": 1,
                    "pagesize": this.config.maxsize,
                    "key":key
                },
                success: function (result) {
                    console.log(result);
                    if (result.code != 1) {
                        this.toast.Show(result.message);
                        return;
                    }
                    var stroption = (isall==true?"<option value=''>全部</option>":"");
                    result.result.rows.forEach(function (row) {
                        if(this.select_info.currentTarget!=null&&this.select_info.currentTarget.data(controlname)==row.id && (this.editlabel=="edit"||this.editlabel=="detail")){//编辑状态
                            stroption += "<option selected='selected' value='" + row.id + "'>" + row.value + "</option>";
                        }else{
                            stroption += "<option value='" + row.id + "'>" + row.value + "</option>";
                        }                        
                    }.bind(this));
                    domObj.find('.'+controlname).empty().append(stroption);
                }.bind(this),
                error: function (data) {
                    this.popup.ShowTip(this.config.messages.other);
                }.bind(this)
            });
    }    

    /**
     * @function 销毁对象
     */
    destroy() {
        this.domObj.remove();
        this.afterDestroy();
    }
}