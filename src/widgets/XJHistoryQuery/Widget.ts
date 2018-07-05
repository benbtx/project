import BaseWidget = require('core/BaseWidget.class');
import Functions = require('core/Functions.module');

import Map = require("esri/map");
import GraphicsLayer = require("esri/layers/GraphicsLayer");
import PictureMarkerSymbol = require("esri/symbols/PictureMarkerSymbol");
import DetailPanel = require('widgets/DetailPanel/Widget');
import Graphic = require("esri/graphic");
import Color = require("esri/Color");
import SimpleMarkerSymbol = require("esri/symbols/SimpleMarkerSymbol");
import InfoTemplate = require("esri/InfoTemplate");
import SpatialReference = require('esri/SpatialReference');
import Polyline = require("esri/geometry/Polyline");
import SimpleLineSymbol = require("esri/symbols/SimpleLineSymbol");
import Point = require('esri/geometry/Point');
import SimpleFillSymbol = require('esri/symbols/SimpleFillSymbol');
import Polygon = require('esri/geometry/Polygon');
import Extent = require("esri/geometry/Extent");
import TextSymbol = require("esri/symbols/TextSymbol");
import InfoWindow = require("esri/dijit/InfoWindow");
import graphicsUtils = require("esri/graphicsUtils");




export = XJHistoryQuery;

class XJHistoryQuery extends BaseWidget {
    baseClass = "widget-XJHistoryQuery";

    map: Map;//地图对象
    queryDate;//查询日期
    /*基础图层（第三方工地，片区，巡检点，巡检线） */
    historyBuildSiteGraphicLayer: XJGraphicLayer;
    historyXjPointGraphicLayer: XJGraphicLayer;
    historyXjLineGraphicLayer: XJGraphicLayer;
    historyXjRegionGraphicLayer: XJGraphicLayer;
    /**图层模块 */
    XJHistoryGraphicLayers: XJGraphicLayer;
    photowall;//隐患图片查看对象
    symbol;//隐患、巡检人员的样式
    hightLightClock;//高亮定时器
    pathPlayerResult;//分段轨迹结果
    playPointX = [];
    playPointY = [];
    xspan = [];
    yspan = [];
    pathindex = -1;
    animationQueue;
    pathPlayImgObj;//轨迹回放点击的图片对象
    initAddVal = { DD: "-1" };
    workerData = [];//巡检人员数据
    historyHideDangerList = [];
    historyHideDangerPopup;
    relativeHistoryGraphicLayers: XJGraphicLayer;
    watchingSetting: WatchingSetting;
    userType = "";//用户类型：总公司(superadmin)，分公司管理员(companyadmin)，分公司部门管理员(departmentadmin)

    partNowdayHideDangerList = [];
    untilNowdayHideDangerList = [];

    startup() {
        var html = _.template(this.template.split("$$")[0])();
        this.setHtml(html);


        //初始化巡检历史查询模块
        this.XJHistoryQueryInit();
        this.domObj.parents(".panel").find(".panel-resize-y").bind("mousedown", function () {
            this.domObj.find(".tab-content").css("height", "calc(100% - 41px)")
        }.bind(this));
    }

    destroy() {
        this.domObj.remove();
        this.afterDestroy();

        this.destoryWidget();
    }

    //模块关闭时，清除相关资源
    destoryWidget() {
        /*图层控制 */
        this.XJHistoryGraphicLayers.removeGraphicLayer();
        if (this.animationQueue) {
            this.animationQueue.stop();
        }
        this.relativeHistoryGraphicLayers.removeGraphicLayer();
        //隐藏infowindow
        this.map.infoWindow.hide();
        this.AppX.runtimeConfig.routeplayer.Hide();
    }


    //初始化查询界面
    XJHistoryQueryInit() {
        this.map = this.AppX.runtimeConfig.map;
        //初始化日期控件
        this.initDateWeight();
        //绑定巡检历史查询事件
        this.domObj.find("button.query").bind("click", this.queryClick.bind(this));
    }


    //初始化日期控件
    initDateWeight() {
        $.jeDate(".widget-XJHistoryQuery input.date", {
            format: 'YYYY-MM-DD', //日期格式  
            isinitVal: true,
            initAddVal: this.initAddVal,
            maxDate: $.nowDate(-1),
            choosefun: function (elem, val) {
                var nowDate = $.nowDate(0).split(" ")[0];
                var addYear = val.split("-")[0] - nowDate.split("-")[0];
                var addMonth = val.split("-")[1] - nowDate.split("-")[1];
                var addDay = val.split("-")[2] - nowDate.split("-")[2];
                this.initAddVal = { YYYY: addYear, MM: addMonth, DD: addDay };
                //清除上次查询结果
                $(".widget-XJHistoryQuery div.queryResult *").remove();
                if (this.animationQueue) {
                    this.animationQueue.stop();
                }
                this.XJHistoryGraphicLayers.clearGraphics();
                this.relativeHistoryGraphicLayers.clearGraphics();
                //设置panel的top属性，以恢复查询界面
                this.domObj.parents(".panel").css("bottom", "auto");
                this.domObj.parents(".panel").css("height", "auto");
            }.bind(this)
        })
    }




    //添加指定的图层
    addGraphicLayer(graphicLayerName: Array<string>) {
        var graphicLayers = [];
        for (var i = 0, length = graphicLayerName.length; i < length; i++) {
            var name = graphicLayerName[i];
            if (this.map.getLayer(name) !== undefined) {
                var oaraginalGraphicLayer = this.map.getLayer(name);
                this.map.removeLayer(oaraginalGraphicLayer);
            }
            var graphicLayer = new GraphicsLayer();
            graphicLayer.id = name;
            this.map.addLayer(graphicLayer);
            graphicLayers.push(graphicLayer);
        }
        return graphicLayers;
    }

    //设置隐患点，巡检人员点等的样式
    setSymbol() {
        var config = this.config.setSymbol;
        var symbol = {
            worker: {
                onWork: new PictureMarkerSymbol(this.root + config.PNGPATH_WorkerPng.onWork, 30, 30),
                offWork: new PictureMarkerSymbol(this.root + config.PNGPATH_WorkerPng.offWork, 30, 30),
                noWork: new PictureMarkerSymbol(this.root + config.PNGPATH_WorkerPng.noWork, 30, 30),
                gpsError: new PictureMarkerSymbol(this.root + config.PNGPATH_WorkerPng.gpsError, 30, 30),
                netError: new PictureMarkerSymbol(this.root + config.PNGPATH_WorkerPng.netError, 30, 30),
                gpsAndNetError: new PictureMarkerSymbol(this.root + config.PNGPATH_WorkerPng.gpsAndNetError, 30, 30),
                gpsErrorActive: new PictureMarkerSymbol(this.root + config.PNGPATH_WorkerPng.gpsErrorActive, 30, 30),
                netErrorActive: new PictureMarkerSymbol(this.root + config.PNGPATH_WorkerPng.netErrorActive, 30, 30)
            },
            checkPoint: {
                checkedPoint: new PictureMarkerSymbol(this.root + config.PNGPATH_CheckPointPng.checked, 45, 45),
                checkingPoint: new PictureMarkerSymbol(this.root + config.PNGPATH_CheckPointPng.checking, 45, 45),
                checkedPath: new SimpleLineSymbol({
                    color: new Color("#0000ff"),
                    style: "solid",   //线的样式 dash|dash-dot|solid等	
                    width: 3
                }),
                checkingPath: new SimpleLineSymbol({
                    color: new Color("#ff0000"),
                    width: 2,
                    style: "solid"
                })
            },
            hideDanger: {
                handled: new PictureMarkerSymbol(this.root + config.PNGPATH_HideDangerPng.handled, 30, 30),
                handling: new PictureMarkerSymbol(this.root + config.PNGPATH_HideDangerPng.handling, 30, 30),
                active: new PictureMarkerSymbol(this.root + config.PNGPATH_HideDangerPng.active, 30, 30),
            },
            pathPlayer: new PictureMarkerSymbol(this.root + config.PNGPATH_PathPlayerPng, 40, 40),
            currentPoint: new SimpleMarkerSymbol(
                {
                    color: new Color("#FF0000"),
                    size: 5,
                    // style: "STYLE_CROSS",       //点样式cross|square|diamond|circle|x
                    yoffset: -8,

                    outline: {
                        color: new Color([255, 0, 0, 0.7]),
                        width: 2
                    }
                }
            ),
            path: {
                oraginalPath: new SimpleLineSymbol({
                    color: new Color("#0000FF"),
                    style: "solid",   //线的样式 dash|dash-dot|solid等	
                    width: 1
                })
            }
        }
        symbol.currentPoint.setStyle(SimpleMarkerSymbol.STYLE_X);
        return symbol;
    }

    //事件处理
    eventInit() {

        //人员状态选择事件
        this.domObj.find("select.userstate").on("change", function (event) {
            var departmentId = this.domObj.find("select.department").find("option:selected").val();
            var userState = this.domObj.find("select.userstate").find("option:selected").val();
            //显示符合部门和状态条件的巡检人员
            this.displayQualifiedUser(departmentId, userState);
        }.bind(this));
    }




    //查询巡检历史单击事件
    queryClick(event) {

        //设置panel的top属性，以适应屏幕高度
        this.domObj.parents(".panel").css("bottom", "50px");
        //获取查询日期
        this.queryDate = this.getQueryDate();
        this.historyHideDangerPopup = this.AppX.runtimeConfig.popup;
        //获取监控设置（轨迹点和线的样式）
        this.requestWatchingSetting();
        //设置显示点的样式
        this.symbol = this.setSymbol();
        //初始化照片查看器
        this.photowall = this.AppX.runtimeConfig.photowall;
        //初始化历史结果界面
        this.domObj.find("div.queryResult *").remove();
        var html = _.template(this.template.split("$$")[1])();
        this.domObj.find(" div.queryResult").append(html);


        //添加所有基础图层到地图
        this.XJHistoryGraphicLayers = new XJGraphicLayer(this.map, this.config.baseLayerIds);
        //添加相关图层（计划，轨迹）到地图
        this.relativeHistoryGraphicLayers = new XJGraphicLayer(this.map, this.config.relativeLayerIds);//添加相关图层（轨迹、计划）
        //判断用户类型
        this.judgeUserType();
        //根据用户初始化界面
        this.initQueryInterface();
        //添加界面的数据（如公司、部门、人员）
        this.initSelectData();
        //初始化模块的基础数据（人员、隐患、图层）
        this.initBasedata(AppX.appConfig.departmentid, AppX.appConfig.groupid);
        //初始化事件
        this.initQueryEvent();

    }

    //获取查询需要的参数，并检查合法性
    getQueryDate() {
        var queryParms: Array<any> = [];
        var date = $(".widget-XJHistoryQuery input.date").val();
        var dateNow = new Date(date);
        var datenext = new Date(dateNow.getTime() + 24 * 60 * 60 * 1000);
        var dateNext = datenext.getFullYear() + "/" + (datenext.getMonth() + 1) + "/" + datenext.getDate();
        queryParms.push(date, dateNext);
        return queryParms;
    }

    /*获取配置信息 */

    requestWatchingSetting() {
        var config = this.config.requestWatchingSetting;
        var toast = this.AppX.runtimeConfig.toast;
        $.ajax({
            headers: {
                'Token': AppX.appConfig.xjxj,
                'departmentid': AppX.appConfig.departmentid,
            },
            type: "POST",
            url: AppX.appConfig.xjapiroot.replace(/\/+$/, "") + config.URL_request,
            data: {
            },
            success: function (result) {
                if (result.code !== 1) {
                    toast.Show(config.MSG_error);
                } else if (result.result.length === 0) {
                    toast.Show(config.MSG_null);
                } else {
                    var refrshTimeSpan = result.result[0].refresh_internal * 1000;
                    var pathLineColor = result.result[0].trail_line_color;
                    var pathLineWidth = result.result[0].trail_line_width;
                    var pathPointColor = result.result[0].trail_point_color;
                    var pathPointWidth = result.result[0].trail_point_width;
                    var wokerPathColor = result.result[0].trail_person_color;
                    var carPathColor = result.result[0].trail_car_color;

                    this.watchingSetting = new WatchingSetting(refrshTimeSpan, wokerPathColor, carPathColor, pathLineColor, pathLineWidth, pathPointColor, pathPointWidth);
                }
            }.bind(this),
            error: function (error) {
                toast.Show(config.MSG_error);
            },
            dataType: "json",
        });
    }


    //判断用户的类型（总公司，分公司，部门管理员）
    judgeUserType() {
        if (AppX.appConfig.groupid != null && AppX.appConfig.groupid != "") {
            this.userType = "departmentadmin";
        } else if (/00;/.test(AppX.appConfig.range)) {
            this.userType = "superadmin";
        } else {
            this.userType = "companyadmin";
        }
    }

    //根据用户初始化历史监控界面
    initQueryInterface() {
        switch (this.userType) {
            case "superadmin":
                this.domObj.find("div.workerlist").addClass("company");
                this.domObj.find("div.hidedangerlist").addClass("company");
                break;
            case "companyadmin":
                this.domObj.find("div.companySelect").remove();
                this.domObj.find("div.pagination").remove();
                break;
            case "departmentadmin":
                this.domObj.find("div.companySelect").remove();
                this.domObj.find("#historyworker div.selector").remove();
                this.domObj.find("#historyhidedanger div.selector").remove();
                this.domObj.find("div.workerlist").addClass("department");
                this.domObj.find("div.hidedangerlist").addClass("department");
                this.domObj.find("div.pagination").remove();
                break;
        }
        // switch (this.userType) {
        //     case "superadmin":
        //         this.domObj.find("div.workerlist").addClass("company");
        //         this.domObj.find("div.hidedangerlist").addClass("company");
        //         this.requestCompanyInfo();//初始化公司、部门、人员查询条件
        //         break;
        //     case "companyadmin":
        //         this.domObj.find("div.companySelect").remove();
        //         this.requestDepartmentInfo(AppX.appConfig.departmentid, [this.initWorkerDepartmentSelect.bind(this), this.initHideDangerDepartmentSelect.bind(this)]);
        //         break;
        //     case "departmentadmin":
        //         this.domObj.find("div.companySelect").remove();
        //         this.domObj.find("#worker div.selector").remove();
        //         this.domObj.find("#hidedanger div.selector").remove();
        //         this.domObj.find("div.workerlist").addClass("department");
        //         this.domObj.find("div.hidedangerlist").addClass("department");
        //         break;
        // }
    }

    //根据用户初始化界面的数据（如公司、部门、人员）
    initSelectData() {
        switch (this.userType) {
            case "superadmin":
                this.requestCompanyInfo();
                this.requestDepartmentInfo(AppX.appConfig.departmentid, [this.initWorkerDepartmentSelect.bind(this), this.initHideDangerDepartmentSelect.bind(this)]);
                this.requestUserInfo(AppX.appConfig.departmentid, AppX.appConfig.groupid, this.initUserSelect.bind(this));//初始化人员查询条件
                break;
            case "companyadmin":
                this.requestDepartmentInfo(AppX.appConfig.departmentid, [this.initWorkerDepartmentSelect.bind(this), this.initHideDangerDepartmentSelect.bind(this)]);
                this.requestUserInfo(AppX.appConfig.departmentid, AppX.appConfig.groupid, this.initUserSelect.bind(this));//初始化人员查询条件
                break;
            case "departmentadmin":
                break;
        }
    }

    requestCompanyInfo() {
        var config = this.config.requestCompanyInfo;
        $.ajax({
            type: "POST",
            url: AppX.appConfig.xjapiroot.replace(/\/+$/, "") + config.URL_request,
            data: {

            },
            success: function (result) {
                if (result.code !== 1) {
                    console.log(result.message);
                } else if (result.result.length === 0) {
                    console.log(config.MSG_null);
                } else {
                    var rows = result.result;
                    var html = "<option value=''>全部</option>";
                    for (var i = 0, length = rows.length; i < length; i++) {
                        var companyId = rows[i].companyid;
                        var companyName = rows[i].company_name;
                        var itemHtml = "<option value='" + companyId + "'>" + companyName + "</option>";
                        html += itemHtml;
                    }

                    //初始化公司下拉选项
                    this.domObj.find("select.company").append(html);
                    //设置当前选中项为该登录用户公司
                    this.domObj.find("select.company option").attr("value", function (index, val) {
                        if (val === AppX.appConfig.departmentid) {
                            $(this).attr("selected", "selected")
                        }
                        return val;
                    });

                }
            }.bind(this),
            error: function (error) {
                console.log(config.MSG_error);
            }.bind(this),
            dataType: "json",
        });
    }

    //请求巡检部门（分组）信息
    requestDepartmentInfo(companyId, callback: Array<any>) {
        if (companyId == "") {
            return;
        }
        var config = this.config.requestDepartmentInfo;
        var toast = this.AppX.runtimeConfig.toast;
        $.ajax({
            headers: {
                'Token': AppX.appConfig.xjxj,
                'departmentid': AppX.appConfig.departmentid,
                "range": AppX.appConfig.range
            },
            type: "POST",
            url: AppX.appConfig.xjapiroot.replace(/\/+$/, "") + config.URL_Request,
            data: {
                "pageindex": 1,
                "pagesize": 100000,
                "companyid": companyId
            },
            success: function (result) {
                if (result.code !== 1) {
                    toast.Show(result.message);
                } else if (result.result.rows.length === 0) {
                    toast.Show(config.MSG_Null);
                } else {
                    for (var i = 0; i < callback.length; i++) {
                        callback[i](companyId, result);
                    }
                }

            }.bind(this),
            error: function () {
                toast.Show(config.MSG_Error);
            },
            dataType: "json",
        });
    }

    //获取部门列表回调函数
    initWorkerDepartmentSelect(companyId, result) {
        var rows = result.result.rows;
        var html = "<option value='allDepartment'>所有</option>";
        var departmentSelectObj = this.domObj.find("select.department");
        var template = departmentSelectObj.find(" #departmenttemplate").text();
        for (var i = 0, length = rows.length; i < length; i++) {
            var departmentName = rows[i].name;
            var departmentId = rows[i].id;
            var data = [departmentId, departmentName];
            var index = 0;
            var replaceTemplate = template.replace(/%data/g, function () {
                return (index < data.length) ? (data[index++]) : "";
            })
            html += replaceTemplate
        }
        departmentSelectObj.append(html);
    }

    //获取部门列表回调函数
    initHideDangerDepartmentSelect(companyId, result) {
        var rows = result.result.rows;
        var html = "<option value='allDepartment'>所有</option>";
        var departmentSelectObj = $(".XJHistoryQuery-result select.historydepartment");
        var template = departmentSelectObj.find(" #departmenttemplate").text();
        for (var i = 0, length = rows.length; i < length; i++) {
            var departmentName = rows[i].name;
            var departmentId = rows[i].id;
            var data = [departmentId, departmentName];
            var index = 0;
            var replaceTemplate = template.replace(/%data/g, function () {
                return (index < data.length) ? (data[index++]) : "";
            })
            html += replaceTemplate
        }
        departmentSelectObj.append(html);
        // //显示部门下的人员信息
        // departmentSelectObj.trigger("change");
    }


    //请求某个部门下的巡检人员信息
    requestUserInfo(companyid, departmentId, callback) {
        var config = this.config.requestUserInfo;
        var toast = this.AppX.runtimeConfig.toast;
        if (departmentId === "allDepartment") {
            departmentId = "";
        }
        $.ajax({
            headers: {
                'Token': AppX.appConfig.xjxj,
                'departmentid': AppX.appConfig.departmentid,
                "range": AppX.appConfig.range
            },
            type: "POST",
            url: AppX.appConfig.xjapiroot.replace(/\/+$/, "") + config.URL_Request,
            data: {
                "pageindex": 1,
                "pagesize": 100000,
                "companyid": companyid,
                "depid": departmentId
            },
            success: function (result) {
                if (result.code !== 1) {
                    toast.Show(config.MSG_Error);
                } else {
                    callback(result);

                }
            }.bind(this),
            error: function () {
                toast.Show(config.MSG_Error);
            },
            dataType: "json",
        });
    }

    initUserSelect(result) {
        var rows = result.result.rows;
        var html = "<option value=\"allWorker\">所有</option>";
        var userSelectObj = $(".XJHistoryQuery-result select.historyusername");
        var template = userSelectObj.find("#usertemplate").text().trim();
        for (var i = 0, length = rows.length; i < length; i++) {
            var userName = rows[i].username;
            if (userName != "管理员") {
                var userId = rows[i].userid;
                var data = [userId, userName];
                var index = 0;
                var replaceTemplate = template.replace(/%data/g, function () {
                    return (index < data.length) ? (data[index++]) : "";
                })
                html += replaceTemplate
            }
        }
        userSelectObj.append(html);

        userSelectObj.change(function () {
            var userid = userSelectObj.find("option:selected").val();
            var departmentid = $(".XJHistoryQuery-result  select.historydepartment").find("option:selected").val();
            //显示该用户上传的隐患
            this.displayHidedangerOfUser(departmentid, userid);
        }.bind(this));
    }



    //初始化本公司或本部门的基础数据（人员信息，隐患信息，图层信息）
    initBasedata(companyid, departmentid) {
        //隐患信息列表
        this.domObj.find("div.hidedangerlist div.item").remove();
        this.requestHideDangerInfo(companyid, departmentid, 1, 100, this.queryDate[0], 0, this.initHideDangerInfo.bind(this));
        //人员信息列表
        this.domObj.find(' #worker .workerlist div.item').remove();
        this.requestAllWorkerInfo(companyid, departmentid, 1, 100, this.queryDate[0], this.initAllWorkInfo.bind(this));  //获取所有巡检人员信息,并添加到地图
        //图层信息
        this.XJHistoryGraphicLayers.clearGraphics();
        this.initBaseLayerInfo(companyid);
    }

    initQueryEvent() {
        //绑定公司下拉改变事件
        if (this.domObj.find("select.company").length != 0) {
            this.domObj.find("select.company").change(function (event) {
                //初始化头部统计数据为0
                this.domObj.find(".XJHistoryQuery-result #myTab a.danger span").text("0");
                this.domObj.find("#myTab a.worker span").text("0/0");
                //初始化所选公司下的部门信息
                var requestCompanyId = this.domObj.find("select.company option:selected").val();
                if (requestCompanyId == "") {
                    this.domObj.find("select.department ").attr("disabled", true);
                    this.domObj.find("select.hidedangerdepartment ").attr("disabled", true);
                } else {
                    this.domObj.find("select.department ").attr("disabled", false);
                    this.domObj.find("select.hidedangerdepartment ").attr("disabled", false);
                    this.domObj.find("select.department option").remove();
                    this.domObj.find(" select.hidedangerdepartment option").remove()
                    this.requestDepartmentInfo(requestCompanyId, [this.initWorkerDepartmentSelect.bind(this), this.initHideDangerDepartmentSelect.bind(this)]);
                }
                //初始化查询公司的基础数据（隐患，人员，图层）
                this.initBasedata(requestCompanyId, "");
            }.bind(this));
        }
        //人员信息：部门下拉改变事件
        if (this.domObj.find("select.department").length != 0) {
            this.domObj.find("select.department").change(function () {
                var departmentId = this.domObj.find("select.department").find("option:selected").val();
                var userState = this.domObj.find("select.userstate").find("option:selected").val();
                //显示符合部门和状态条件的巡检人员
                this.displayQualifiedUser(departmentId, userState);
            }.bind(this));
        }
        //人员信息：人员状态下拉改变事件
        this.domObj.find("select.userstate").on("change", function (event) {
            var departmentId = this.domObj.find("select.department").find("option:selected").val();
            var userState = this.domObj.find("select.userstate").find("option:selected").val();
            this.displayQualifiedUser(departmentId, userState);//显示符合部门和状态条件的巡检人员
        }.bind(this));

        // 隐患信息：部门下拉改变事件
        this.domObj.find("select.historydepartment").change(function (event) {
            this.domObj.find(" select.historyusername option").remove();
            var companyId = this.domObj.find(" select.company option:selected").val();
            var departmentId = $(event.currentTarget).find("option:selected").val();
            this.requestUserInfo(companyId, departmentId, this.initUserSelect.bind(this));//初始化人员查询条件
            //显示当前部门上传的隐患
            this.displayHidedangerOfTheDepartment(departmentId);
        }.bind(this));

        // 隐患信息：人员下拉改变事件
        this.domObj.find("select.hidedangerusername").change(function () {
            var userid = $(event.currentTarget).find("option:selected").val();
            var departmentid = this.domObj.find("select.hidedangerdepartment").find("option:selected").val();
            //显示该用户上传的隐患
            this.displayHidedangerOfUser(departmentid, userid);
        }.bind(this));

        /*图层控制 */
        this.domObj.find("#historyxunjianlayer li input[type='checkbox']").bind("click", function (event) {
            var layerName = $(event.currentTarget).parent("li").attr("layername");
            var choosedState = $(event.currentTarget).parent("li").attr("choosed");
            var curentObject = $(event.currentTarget).parent("li");
            var checkboxObjec = $(this);
            this.layerControl(layerName, choosedState, curentObject, checkboxObjec);
        }.bind(this)); //图层关闭和打开
    }






    /*
 * 图层控制
 */

    //图层控制（显示和隐藏）
    layerControl(layerName, choosedState, curentObject, checkboxObjec) {
        var config = this.config.layerControl;
        var activeGraphicLayer = <GraphicsLayer>this.map.getLayer("worker_historyActiveGraphicLayer");
        activeGraphicLayer.clear();
        var layer = this.map.getLayer(layerName);
        if (choosedState == "yes") {
            layer.hide();
            curentObject.attr("choosed", "no");
            checkboxObjec.prop("checked", false);
        } else {
            layer.show();
            curentObject.attr("choosed", "yes");
            checkboxObjec.prop("checked", true);
            var headers = {
                'Token': AppX.appConfig.xjxj,
                'departmentid': AppX.appConfig.departmentid,
                "range": AppX.appConfig.range
            };
            var companyId = AppX.appConfig.departmentid;
            if (this.domObj.find("select.companySelect option:selected").length != 0) {
                companyId = this.domObj.find("select.companySelect option:selected").val();
            }
            switch (layerName) {
                case "historyGraphicLayer_xjregion":
                    var xjRegionUrl = AppX.appConfig.xjapiroot.replace(/\/+$/, "") + config.URL_region;
                    var xjRegionData = {
                        "companyid": companyId,
                        "depid": AppX.appConfig.groupid,
                        "pageindex": 1,
                        "pagesize": 100000,
                        "search_date": this.queryDate[0],
                        "monitor_state": 1,
                    };
                    var xjRegionInfoInterface = new BackGroundInterface(xjRegionUrl, headers, xjRegionData, this.requestXJRegionInfoCallback.bind(this));
                    break;
                case "historyGraphicLayer_buildsite":
                    var buildSiteUrl = AppX.appConfig.xjapiroot.replace(/\/+$/, "") + config.URL_buildsite;
                    var data = {
                        "companyid": companyId,
                        "depid": AppX.appConfig.groupid,
                        "pageindex": 1,
                        "pagesize": 100000,
                        "search_date": this.queryDate[0],
                        "check_state": "0,2",
                        "monitor_state": 0
                    };
                    var buildSiteInfoInterface = new BackGroundInterface(buildSiteUrl, headers, data, this.requestBuildSiteInfoCallback.bind(this));
                    break;
                case "historyGraphicLayer_xjpoint":
                    //巡检点
                    var xjPointUrl = AppX.appConfig.xjapiroot.replace(/\/+$/, "") + config.URL_xjpoint;
                    var xjpointData = {
                        "companyid": companyId,
                        "depid": AppX.appConfig.groupid,
                        "pageindex": 1,
                        "pagesize": 100000,
                        "device_type_id": 1,
                        "search_date": this.queryDate[0],
                        "monitor_state": 1
                    };
                    var xjPointInfoInterface = new BackGroundInterface(xjPointUrl, headers, xjpointData, this.requestXJpointInfoCallback.bind(this));
                    break;
                case "historyGraphicLayer_xjline":
                    //巡检线
                    var xjLineUrl = AppX.appConfig.xjapiroot.replace(/\/+$/, "") + config.URL_xjpoint;
                    var xjLineData = {
                        "companyid": companyId,
                        "depid": AppX.appConfig.groupid,
                        "pageindex": 1,
                        "pagesize": 100000,
                        "device_type_id": 6,
                        "search_date": this.queryDate[0],
                        "monitor_state": 1
                    };
                    var xjLineInfoInterface = new BackGroundInterface(xjLineUrl, headers, xjLineData, this.requestXJLineInfoCallback.bind(this));
                    break;
                case "historyGraphicLayer_hidedanger":
                    this.requestHideDangerInfo(companyId, AppX.appConfig.groupid, 1, 10000, this.queryDate[0], 0, this.initHideDangerInfo.bind(this));

                    break;
                case "historyGraphicLayer_worker":
                    this.requestAllWorkerInfo(companyId, AppX.appConfig.groupid, 1, 10000, this.queryDate[0], this.initAllWorkInfo.bind(this));
                    break;
            }

        }
    }



    /*
     *    隐患分布全局图
     * 1. 向后台请求当天上报的所有隐患，并在回调函数中对结果进行处理
     * 2. 回调函数中，先添加所有隐患图形到地图
     * 3. 接着，初始化隐患列表,并在列表中查看照片、定位、及查看详细信息
     */

    //获取当天的隐患信息
    requestHideDangerInfo(companyId, departmentid, pageindex, pagesie, searchDate, untilNowday, callBack) {
        var config = this.config.requestHideDangerInfo;
        var toast = this.AppX.runtimeConfig.toast;
        this.historyHideDangerList = [];
        $.ajax({
            headers: {
                'Token': AppX.appConfig.xjxj,
                'departmentid': AppX.appConfig.departmentid,
                "range": AppX.appConfig.range
            },
            type: "POST",
            url: AppX.appConfig.xjapiroot.replace(/\/+$/, "") + config.URL_Query,
            data: {
                "companyid": companyId,
                "depid": departmentid,
                "pageindex": pageindex,//1
                "pagesize": pagesie,//1000
                "search_date": searchDate,//2017/7/1
                "monitor_state": untilNowday,
                "handle_state": 0,
            },
            success: function (result) {
                if (result.code !== 1) {
                    toast.Show(result.message);
                } else if (result.result.rows.length === 0) {
                    return;
                } else {
                    var rows = result.result.rows;
                    for (var i = 0, length = rows.length; i < length; i++) {
                        var finder = rows[i].username;//上报人员
                        var finderId = rows[i].userid;//上报人员id
                        var departmentId = rows[i].depid;//上报人员部门id
                        var departmentName = rows[i].depname;//上报人员部门名称
                        var type = rows[i].trouble_type_name;//隐患类型
                        var minPicture = rows[i].yhfx_thumb;//隐患发现图片缩略图
                        var picture = rows[i].yhfx;//隐患发现图片
                        var audio = rows[i].yhqyp;//隐患发现音频
                        var findNotes = rows[i].handle_before_notes;//发现时备注
                        var address = rows[i].address;//隐患地址
                        var longitude = rows[i].location_longitude;//经度
                        var latitude = rows[i].location_latitude;//纬度
                        var findTime = rows[i].findtime;//隐患发现时间
                        var handleProcess = rows[i].process_name;//处理流程名
                        var minClearPicture = rows[i].yhqc_thumb;//隐患清除照片缩略图
                        var clearPicture = rows[i].yhqc;//隐患清除照片
                        var clearNotes = rows[i].handle_after_notes;//处理后备注
                        var hiderDanger = new Hidedanger(finder, finderId, departmentId, departmentName, type, minPicture, picture, audio, findNotes, address, longitude, latitude, findTime, handleProcess, minClearPicture, clearPicture, clearNotes);
                        if (result.result.pagesize > 1000) {
                            this.untilNowdayHideDangerList.push(hiderDanger);
                        } else {
                            this.partNowdayHideDangerList.push(hiderDanger);
                        }

                    }
                    callBack(result, this.partNowdayHideDangerList, this.untilNowdayHideDangerList);
                }

            }.bind(this),
            error: function () {
                toast.Show(config.MSG_Error);
            }.bind(this),
            dataType: "json"
        });
    }



    //获取隐患信息回调函数
    initHideDangerInfo(result, partNowdayHideDangerList: Array<Hidedanger>, untilNowdayHideDangerList: Array<Hidedanger>) {
        if (result.result.pagesize < 1000) {
            this.initHideDangerList(result, partNowdayHideDangerList);
        } else if (result.result.pagesize > 1000) {
            this.addAllHideDangerGraphic(untilNowdayHideDangerList);
        }

    }

    //添加所有隐患点到地图
    addAllHideDangerGraphic(historyHideDangerList: Array<Hidedanger>) {
        var hideDangerGraphicLayer = <GraphicsLayer>this.map.getLayer("historyGraphicLayer_hidedanger");
        hideDangerGraphicLayer.clear();
        for (var i = 0, length = historyHideDangerList.length; i < length; i++) {
            var x = historyHideDangerList[i].longitude;
            var y = historyHideDangerList[i].latitude;
            var point = new Point(x, y, this.map.spatialReference);
            var infoTemplate = new InfoTemplate({
                title: "隐患详情",
                content: this.template.split('$$')[2]
            });
            var graphic = new Graphic(point, this.symbol.hideDanger.handling, "", infoTemplate);
            graphic.setAttributes({
                "person": historyHideDangerList[i].finder,
                "address": historyHideDangerList[i].address,
                "description": historyHideDangerList[i].findNotes,
                "type": historyHideDangerList[i].type,
                "index": i,
                "time": historyHideDangerList[i].findTime.split(" ")[0]
            });
            hideDangerGraphicLayer.add(graphic);
        }

        //点击查看详情事件
        $("body").on("click", "a.XJHistoryQuery-hidedangerdetail", function (event) {
            var index = $(event.currentTarget).attr("index");
            this.viewHideDangerDetail(index);
        }.bind(this));
    }

    //添加隐患graphic
    addHideDangerGraphic(point, graphicLayer, infoTemplate, symbol) {
        var graphic = new Graphic(point, symbol, "", infoTemplate);
        graphicLayer.add(graphic);
        return graphic;
    }

    viewHideDangerDetail(index) {
        this.historyHideDangerPopup.setSize(730, 400);
        var data = this.untilNowdayHideDangerList[index].getHideDangePopupData();
        var dataIndex = 0;
        var template = this.template.split("$$")[5].replace(/%data/g, function () {
            return (dataIndex < data.length) ? (data[dataIndex++]) : "";
        });
        var Obj = this.historyHideDangerPopup.Show("隐患详情", template);
        Obj.conObj.find("ul ").viewer(
            {
                title: 0,
                navbar: 0
            }
        );

    }

    //初始化隐患列表
    initHideDangerList(result, hideDangerList: Array<Hidedanger>) {
        //清除之前的添加的数据
        if ($('.XJHistoryQuery-result #historyhidedanger .hidedangerlist div.item')) {
            $('.XJHistoryQuery-result #historyhidedanger .hidedangerlist div.item').remove();
        }
        //初始化隐患列表
        var template = this.template.split("$$")[6].trim();
        var html = "";
        var totalDanger = 0;//总上传隐患数
        for (var i = 0, length = hideDangerList.length; i < length; i++) {
            //只显示今天上报的隐患
            var hideFindTime = hideDangerList[i].findTime.split(" ")[0];
            var hideFindTimeMillSecond = new Date(parseInt(hideFindTime.split("-")[0]), parseInt(hideFindTime.split("-")[1]) - 1, parseInt(hideFindTime.split("-")[2])).getTime();
            var nowYear = new Date().getFullYear();
            var nowMoth = new Date().getMonth();
            var nowDate = new Date().getDate();
            var nowDayMillSecond = new Date(this.queryDate[0].split("-")[0], parseInt(this.queryDate[0].split("-")[1]) - 1, this.queryDate[0].split("-")[2]).getTime();//毫秒数
            var data = hideDangerList[i].getHideDangerListData();
            var index = 0;
            var templateReplace = _.template(template)({ photoData: data[data.length - 1] });
            if (hideFindTimeMillSecond === nowDayMillSecond) {
                var templateReplace = templateReplace.replace(/%data/g, function () {
                    return (index < data.length) ? (data[index++]) : "";
                });
                html += templateReplace;
                totalDanger++;
            }
        }
        $('.XJHistoryQuery-result #historyhidedanger .hidedangerlist').append(html);
        //初始化表头
        var totalDangerText = "(" + totalDanger + ")"
        $(".XJHistoryQuery-result #myTab a.danger span").text(totalDangerText);
        //初始化分页信息
        var pageIndex = result.result.pageindex;
        var pageSize = result.result.pagesize;
        var total = result.result.total;
        var totalPage = Math.ceil(total / parseInt(pageSize));//总页数
        this.domObj.find(".hidedangerpagination .currentpagenumber").text(pageIndex);
        this.domObj.find(".hidedangerpagination .allpagenumber").text(totalPage);
        //绑定每一项单击事件和图片查看事件
        $(".XJHistoryQuery-result #historyhidedanger .hidedangerlist div.content a").bind("click", function (event) {
            var x = parseFloat($(event.currentTarget).attr("longitude"));
            var y = parseFloat($(event.currentTarget).attr("latitude"));
            this.locateHideDangerItem(x, y);
        }.bind(this));
        //
        $(".XJHistoryQuery-result #historyhidedanger .hidedangerlist div.img").find("ul").viewer({
            title: 0,
            navbar: 0,
        });
        $(".XJHistoryQuery-result #historyhidedanger .hidedangerlist div.img").bind("click", function (event) {
            $(this).find("ul li img").attr("src", function (index, val) {
                var maxSrc = $(this).attr("maxpicture");
                return maxSrc;
            })
        });
    }

    //每条隐患定位并高亮
    locateHideDangerItem(x, y) {
        //清除原有图形
        var activeGraphicLayer = <GraphicsLayer>this.map.getLayer("worker_historyActiveGraphicLayer");
        activeGraphicLayer.clear();
        //高亮详情点
        var point = new Point(x, y, new SpatialReference({ wkid: this.map.spatialReference.wkid }));
        var symbol = new SimpleLineSymbol({
            "color": new Color("#ff0000"),
            "size": 40,
            "angle": -30,
            "xoffset": 0,
            "yoffset": 0,
            "type": "esriSMS",
            "style": "esriSMSCircle",
        });
        var activeGraphic = new Graphic(point, symbol);
        activeGraphicLayer.add(activeGraphic);
        this.map.centerAndZoom(point, 11);

        var hideDangerGraphicLayer = <GraphicsLayer>this.map.getLayer("historyGraphicLayer_hidedanger");
        var graphics = hideDangerGraphicLayer.graphics;
        for (var i = 0; i < graphics.length; i++) {
            var geometry: Point = <Point>graphics[i].geometry;
            if (geometry.x == x && geometry.y == y) {
                var infoWindow: InfoWindow = <InfoWindow>this.map.infoWindow;
                infoWindow.setTitle("隐患详情");
                infoWindow.setContent(graphics[i].getContent());
                infoWindow.show(geometry);
            }
        }

    }

    //每条隐患查看照片
    viewHideDangerImage(imgsrc) {
        var imgData = [];
        for (var i = 0, length = imgsrc.length; i < length; i++) {
            if (imgsrc[i] !== "") {
                var data = { src: imgsrc[i], alt: "" };
                imgData.push(data);
            }

        }
        this.photowall.setSize(400, 450);
        var htmlString = _.template(this.template.split('$$')[4])({ photoData: imgData });
        var Obj = this.photowall.Show("隐患照片", htmlString);
    }


    /*
     * 地图显示巡检人员位置，并标识出其状态
     * 1.
     */

    //向服务器请求巡检人员信息
    requestAllWorkerInfo(companyId, departmentid, pageindex, pagesize, queryDate, callBack) {
        var config = this.config.requestAllWorkerInfo;
        var toast = this.AppX.runtimeConfig.toast;
        $.ajax({
            headers: {
                'Token': AppX.appConfig.xjxj,
                'departmentid': AppX.appConfig.departmentid,
                "range": AppX.appConfig.range
            },
            type: "POST",
            url: AppX.appConfig.xjapiroot.replace(/\/+$/, "") + config.URL_Query,
            data: {
                "companyid": companyId,
                "deptid": departmentid,
                "pageindex": pageindex,
                "pagesize": pagesize,
                "search_date": queryDate,
            },
            success: function (result) {
                if (result.code !== 1) {
                    toast.Show(result.message);
                } else if (result.result.rows.length === 0) {
                    toast.Show(config.MSG_Null);
                } else {
                    callBack(result);
                }
            }.bind(this),
            error: function () {
                toast.Show(config.MSG_QueryError);
            },
            dataType: "json",
        });
    }

    //获取巡检人员信息回调函数
    initAllWorkInfo(result) {
        if (result.result.pagesize > 1000) {
            //所有巡检员信息添加到地图 
            this.addAllWorkerGraphic(result);
        } else if (result.result.pagesize < 1000) {
            var workInfos = [];
            var rows = result.result.rows;
            for (var i = 0, length = rows.length; i < length; i++) {
                var workInfo = {
                    "departmentId": rows[i].depid,//部门id
                    "userId": rows[i].userid,//用户id
                    "userName": rows[i].username,//用户名
                    "headPicture": rows[i].avatar,//头像
                    "x": (rows[i].lat_lng !== null && rows[i].lat_lng !== "") ? rows[i].lat_lng.lng : 0,//经度
                    "y": (rows[i].lat_lng !== null && rows[i].lat_lng !== "") ? rows[i].lat_lng.lat : 0,//纬度
                    "onTime": rows[i].on_time,//上班时间（多次签到）
                    "offTime": rows[i].off_time,//下班时间（多次签退）
                    "hideDangerCount": rows[i].today_trouble_num,//该用户发现隐患数量
                    "allPlanDeviceCount": rows[i].total_point,//当天计划巡检设备总数
                    "finishPlanDeviceCount": rows[i].today_point_isover,//当天计划已检巡检设备总数
                    "equipmentInfo": (rows[i].equip_info != null && rows[i].equip_info.length !== 0) ? {//设备信息
                        "gpsState": rows[i].equip_info[0].gps_state,
                        "netState": rows[i].equip_info[0].network_state,
                        "gpsType": rows[i].equip_info[0].gps_type,
                        "carNumber": rows[i].equip_info[0].plate_number,
                        "workerState": rows[i].equip_info[0].work_state
                    } : undefined,
                    "pageInfo": {//分页信息
                        "pageIndex": result.result.pageindex,
                        "pageSize": result.result.pagesize,
                        "total": result.result.total

                    }
                }
                workInfos.push(workInfo);
            }
            // //初始化巡检人员列表
            // this.initWorkerList(result);
            this.initWorkerList(workInfos);
        }
    }

    //初始化巡检人员点graphic
    addAllWorkerGraphic(result) {
        //初始化头部信息(分页数据中，在线人数不全)
        var totalCount = result.result.total;
        var onlineCount = 0;
        var rows = result.result.rows;
        for (var i = 0, length = rows.length; i < length; i++) {
            var loginTime = rows[i].on_time;//上班时间
            if (loginTime !== null && loginTime !== "") {
                onlineCount++;
            }
        }
        var headInfo = onlineCount + "/" + totalCount;
        this.domObj.find("#myTab a.worker span").text(headInfo);
    }

    //初始化巡检人员列表
    initWorkerList(workInfos: Array<any>) {
        var config = this.config.initWorkerList;
        //移除之前添加的数据
        if (this.domObj.find('#historyworker .workerlist div.item')) {
            this.domObj.find(' #historyworker .workerlist div.item').remove();
        }


        //初始化头部信息
        var onlineCount = 0;
        var totalCount = workInfos.length;
        for (var i = 0; i < workInfos.length; i++) {
            if (workInfos[i].onTime !== "" && workInfos[i].workTimeSpan !== null) {
                onlineCount++;
            }
        }

        var template = this.domObj.find("#historyworker .workerlist #workeritemtemplate").text().trim();
        var html = "";
        for (var j = 0, length = workInfos.length; j < length; j++) {
            var subName = (workInfos[j].userName.length > 4) ? workInfos[j].userName.substr(0, 4) + "..." : workInfos[j].userName;  //巡检人员姓名
            var xjapiRoot = AppX.appConfig.xjapiroot;
            //头像信息，有头像则显示，无则显示默认头像
            var headPicture = workInfos[j].headPicture;
            var oraginalAvatar = "no";
            if (headPicture !== "" && headPicture !== null) {
                headPicture = AppX.appConfig.xjapiroot.substr(0, xjapiRoot.length - 3) + workInfos[j].headPicture;//上传头像地址
            } else if (workInfos[j].onTime === null || workInfos[j].onTime === "") {
                headPicture = config.IMG_avatarOff;//默认离线头像
                oraginalAvatar = "yes";
            } else if (workInfos[j].equipmentInfo !== undefined && workInfos[j].equipmentInfo.workerState === 3) {
                headPicture = config.IMG_avatarOff;//默认离线头像
                oraginalAvatar = "yes";
            } else {
                headPicture = config.IMG_avatarOn;//默认在线头像
                oraginalAvatar = "yes";
            }
            //是否车巡，如果车巡，显示车牌号；当前处于车巡，车牌号为蓝色，处于人巡，车牌号为灰色
            var carNumber = "&nbsp&nbsp";//车巡的车牌号
            var carCheck = "";//是否车巡
            if (workInfos[j].equipmentInfo !== undefined) {
                if (workInfos[j].equipmentInfo.gpsType === 0 && workInfos[j].equipmentInfo.gpsType == null) {
                    carCheck = "no";
                    if (workInfos[j].equipmentInfo.carNumber !== null && workInfos[j].equipmentInfo.carNumber != "") {
                        carNumber = workInfos[j].equipmentInfo.carNumber;
                    }
                } else if (workInfos[j].equipmentInfo.gpsType === 1) {
                    carCheck = "yes";
                    carNumber = workInfos[j].equipmentInfo.carNumber;
                }
            }
            var collapseIndex = this.baseClass + "relativeinfo" + j;
            //人员状态
            var userState = "";
            var title = "";

            var equipmentInfo = workInfos[j].equipmentInfo;
            if (workInfos[j].onTime === null || workInfos[j].onTime === "") {
                title = workInfos[j].userName + "-未上班";
                userState = "noWork";
            } else {
                var workState = workInfos[j].equipmentInfo !== undefined ? workInfos[j].equipmentInfo.workerState : 3;
                var gpsState = workInfos[j].equipmentInfo !== undefined ? workInfos[j].equipmentInfo.gpsState : 1;
                var netState = workInfos[j].equipmentInfo !== undefined ? workInfos[j].equipmentInfo.netState : 1;
                switch (workState) {
                    case 3://下班
                        title = workInfos[j].userName + "-下班"
                        userState = "offWork";
                        break;
                    default://异常
                        if (netState == 0) {
                            title = workInfos[j].userName + "-上班网络异常";
                            userState = "workNetError";
                        }
                        else if (gpsState == 0 && netState == 1) {
                            title = workInfos[j].userName + "-上班gps未开启";
                            userState = "workNoGps";
                        } else if (gpsState == 2 && netState == 1) {
                            title = workInfos[j].userName + "-上班gps异常";
                            userState = "workGpsError";
                        } else if (gpsState == 1 && netState == 1) {
                            title = workInfos[j].userName + "-上班正常";
                            userState = "workNormal";
                            break;
                        }
                }
            }

            //计划 完成情况、上报隐患情况
            var finishTitle = "发现隐患" + workInfos[j].hideDangerCount + "个，" + "已巡" + workInfos[j].finishPlanDeviceCount + ",总巡检数" + workInfos[j].allPlanDeviceCount;
            var hideDangerAndPlan = workInfos[j].hideDangerCount + "/" + workInfos[j].finishPlanDeviceCount + '/' + workInfos[j].allPlanDeviceCount;

            var data = [workInfos[j].departmentId, userState, oraginalAvatar, headPicture, workInfos[j].userId, userState, title, workInfos[j].x, workInfos[j].y, subName, collapseIndex, collapseIndex, collapseIndex, finishTitle, hideDangerAndPlan, carCheck, carNumber, collapseIndex, collapseIndex, collapseIndex];
            var index = 0;
            var templateReplace = template.replace(/%data/g, function () {
                return (index < data.length) ? (data[index++]) : "";
            });
            html += templateReplace;

        }
        this.domObj.find('#historyworker .workerlist div.item').remove();
        this.domObj.find(' #historyworker .workerlist').append(html);
        //初始化分页信息
        var pageInfo = workInfos[0].pageInfo;
        var pageIndex = pageInfo.pageIndex;
        var pageSize = pageInfo.pageSize;
        var total = pageInfo.total;
        var totalPage = Math.ceil(parseInt(total) / parseInt(pageSize));//总页数
        this.domObj.find(".workerpagination .currentpagenumber").text(pageIndex);
        this.domObj.find(".workerpagination .allpagenumber").text(totalPage);

        // //巡检人员定位到地图
        // this.domObj.find("#historyworker .workerlist a.workername").bind("click", function (event) {
        //     var x = parseFloat($(event.currentTarget).attr("longitude"));
        //     var y = parseFloat($(event.currentTarget).attr("latitude"));
        //     var userstate = $(event.currentTarget).attr("userstate");
        //     this.locateWorkerItem(x, y, userstate);
        // }.bind(this));
        //查看巡检人员的日志、轨迹、巡检点等
        this.domObj.find("#historyworker .workerlist div.item a.detail").on("click", this.workerDetailLinkClick.bind(this));
    }

    //巡检人员定位
    locateWorkerItem(x, y, userstate) {
        var config = this.config.locateWorkerItem;
        //清除原有图形
        var activeGraphicLayer = <GraphicsLayer>this.map.getLayer("worker_historyActiveGraphicLayer");
        activeGraphicLayer.clear();
        if (x === 0 && y === 0) {
            this.AppX.runtimeConfig.toast.Show(config.MSG_locateerror)
        } else {
            //高亮详情点
            var point = new Point(x, y, new SpatialReference({ wkid: this.map.spatialReference.wkid }));
            var symbol = new SimpleLineSymbol({
                "color": new Color("#ff0000"),
                "size": 40,
                "angle": -30,
                "xoffset": 0,
                "yoffset": 0,
                "type": "esriSMS",
                "style": "esriSMSCircle",
            });
            var activeGraphic = new Graphic(point, symbol);
            activeGraphicLayer.add(activeGraphic);
            this.map.centerAndZoom(point, 11);
        }
    }

    /*
    * 查看手持端工作日志
    */

    //人员详细链接点击事件
    workerDetailLinkClick(event) {
        var requestType = $(event.currentTarget).attr("requesttype");
        var userID = $(event.currentTarget).parents("div.item").find("div.head").attr("userid")
        if (requestType === "log") {
            if ($(event.currentTarget).parents("div.item").find("div.relativeinfo.in[requesttype='log']").length == 0) {
                //清除之前的结果
                this.domObj.find(".workerlist .relativeinfo *").remove();
                if (this.domObj.find(".workerlist .relativeinfo").hasClass("in")) {
                    this.domObj.find(".workerlist .relativeinfo.in").collapse("hide");
                }
                if (this.animationQueue) {
                    this.animationQueue.stop();
                }

                this.relativeHistoryGraphicLayers.clearGraphics();
                var targetID = "#" + $(event.currentTarget).parents("div.item").find("div.relativeinfo[requesttype='log']").attr("id");
                //获取工作日志
                this.requestWorkerLog(1, 10000, userID, this.queryDate[0], targetID, this.initWorkerLog.bind(this));
            }


        } else if (requestType === "path") {
            if ($(event.currentTarget).parents("div.item").find("div.relativeinfo.in[requesttype='path']").length == 0) {
                //清除之前的结果
                this.domObj.find(" .workerlist .relativeinfo *").remove();
                if (this.domObj.find(".workerlist .relativeinfo").hasClass("in")) {
                    this.domObj.find(".workerlist .relativeinfo.in").collapse("hide");
                }
                var targetID = "#" + $(event.currentTarget).parents("div.item").find("div.relativeinfo[requesttype='path']").attr("id");
                if (this.animationQueue) {
                    this.animationQueue.stop();
                }
                this.relativeHistoryGraphicLayers.clearGraphics();
                this.requestWorkerPath(userID, this.queryDate[0] + " 00:00:00", this.queryDate[0] + " 23:59:59", this.addWorkerAllPathToMap.bind(this));
                //获取分段巡检轨迹
                this.requestWorkerSectionPathIndex(userID, this.queryDate[0], targetID, this.requestWorkerSectionPathCallBack.bind(this));
            }


            // //清除之前的结果
            // this.domObj.find(".workerlist div.relativeinfo *").remove();
            // if (this.domObj.find(".workerlist .collapse").hasClass("in")) {
            //     this.domObj.find(".workerlist .collapse.in").collapse("hide");
            // }
            // if (this.animationQueue) {
            //     this.animationQueue.stop();
            // }
            // var targetID = "#" + $(event.currentTarget).parents("div.item").find("div.relativeinfo[requesttype='path']").attr("id");
            // this.relativeHistoryGraphicLayers.clearGraphics();
            // this.requestWorkerPath(userID, this.queryDate[0] + " 00:00:00", this.queryDate[0] + " 23:59:59", this.addWorkerAllPathToMap.bind(this));
            // //获取分段巡检轨迹
            // this.requestWorkerSectionPathIndex(userID, this.queryDate[0], targetID, this.requestWorkerSectionPathCallBack.bind(this));
        } else if (requestType === "checkpoint") {
            if ($(event.currentTarget).parents("div.item").find("div.relativeinfo.in[requesttype='checkpoint']").length == 0) {
                //清除之前的结果
                this.domObj.find(".workerlist .relativeinfo *").remove();
                if (this.domObj.find(".workerlist .relativeinfo").hasClass("in")) {
                    this.domObj.find(".workerlist .relativeinfo.in").collapse("hide");
                }
                var targetID = "#" + $(event.currentTarget).parents("div.item").find("div.relativeinfo[requesttype='checkpoint']").attr("id");
                if (this.animationQueue) {
                    this.animationQueue.stop();
                }
                this.relativeHistoryGraphicLayers.clearGraphics();
                this.requestWorkerCheckPoint(userID, targetID);
            }
        }


    }

    //获取巡检人工作日志
    requestWorkerLog(pageIndex, pageSize, userID, searchDate, targetID, callBack) {
        var config = this.config.requestWorkerLog;
        var toast = this.AppX.runtimeConfig.toast;
        $.ajax({
            headers: {
                'Token': AppX.appConfig.xjxj,
                'departmentid': AppX.appConfig.departmentid,
                "range": AppX.appConfig.range
            },
            type: "POST",
            url: AppX.appConfig.xjapiroot.replace(/\/+$/, "") + config.URL_request,
            data: {
                "pageindex": pageIndex,
                "pagesize": pageSize,
                "userid": userID,
                "search_date": searchDate
            },
            success: function (result) {
                if (result.code !== 1) {
                    toast.Show(result.message);
                } else if (result.result.rows.runlog === null || result.result.rows.runlog.length == 0) {
                    toast.Show(config.MSG_null);
                } else {
                    var logInfos = [];
                    var runlog = result.result.rows.runlog;
                    for (var i = 0, length = runlog.length; i < length; i++) {
                        var logInfo = {
                            "gpsState": runlog[i].gps_state,//gps状态0关闭；1开启
                            "netState": runlog[i].network_state,//网络状态0关闭；1开启
                            "workState": runlog[i].work_state,//设备状态(0,开机：1：上班，2：工作中；3：下班；4：异常)
                            "checkTime": runlog[i].check_time//设备检测时间
                        }
                        logInfos.push(logInfo);
                    }
                    callBack(logInfos, targetID);
                }

            }.bind(this),
            error: function () {
                toast.Show(config.MSG_error);
            },
            dataType: "json",
        });
    }

    //初始化日志列表
    initWorkerLog(logInfos: Array<any>, targetID) {
        var config = this.config.initWorkerLog;
        var template = $(".XJHistoryQuery-result .workerlist #workerlog").text().trim()
        var html = "";
        for (var i = 0, length = logInfos.length; i < length; i++) {
            var terminalState = "";
            var terminalPng = "";
            var time = logInfos[i].checkTime.split(" ")[1];
            if (logInfos[i].workState != 2 && logInfos[i].workState != 4) {
                switch (logInfos[i].workState) {
                    case 0:
                        terminalState = "开机";
                        terminalPng = "";
                        break;
                    case 1:
                        terminalState = "上班";
                        terminalPng = config.IMG_onwork;
                        break;
                    case 3:
                        terminalState = "下班";
                        terminalPng = config.IMG_offwork;
                        break;
                }
            } else {
                switch (logInfos[i].netState) {
                    case 0:
                        terminalState = "网络异常";
                        terminalPng = config.IMG_gpserror;
                        break;
                    case 1:
                        if (logInfos[i].netState == 0) {
                            terminalState = "gps未开启";
                            terminalPng = config.IMG_gpserror;
                        } else if (logInfos[i].netState == 2) {
                            terminalState = "gps异常";
                            terminalPng = config.IMG_gpserror;
                        } else if (logInfos[i].netState == 1) {
                            terminalState = "设备正常";
                            terminalPng = config.IMG_gpsnormal;
                        }
                }


                //     gpsState = logInfos[i].gpsState;
                //     // var netState = logInfos[i].networkState;

                //     if (netState == 1) {
                //         if (gpsState == 0) {
                //             gpsState = "gps未开启";
                //             gpsPng = config.IMG_gpserror;
                //         } else if (gpsState == 1) {
                //             gpsState = "gps正常";
                //             gpsPng = config.IMG_gpsnormal;
                //         } else if (gpsState == 2) {
                //             gpsState = "gps异常";
                //             gpsPng = config.IMG_gpserror;
                //         }
                //     } else {
                //         gpsState = "网络异常";
                //         gpsPng = config.IMG_gpserror;
                //     }
                // }

            }
            var data = [terminalPng, terminalState, time];
            var index = 0;
            var templateReplace = template.replace(/%data/g, function () {
                return (index < data.length) ? (data[index++]) : "";
            });
            html += templateReplace;
        }
        var selector = ".XJHistoryQuery-result .workerlist " + targetID
        $(selector).append(html);


    }


    /*
    * 查看单个巡检人员的计划，及完成情况
    */

    //获取巡检人巡检点
    requestWorkerCheckPoint(userid, targetID) {
        //获取巡检人员巡检计划包含今天的所有巡检计划id
        this.requestWorkerAllPlanId(userid, this.queryDate[0], targetID, this.initWorkerAllPlanList.bind(this));
        //

    }

    //获取巡检人员巡检计划包含今天的所有巡检计划id
    requestWorkerAllPlanId(userid, searchDate, targetID, callback) {
        var config = this.config.requestWorkerAllPlanId;
        var toast = this.AppX.runtimeConfig.toast;
        $.ajax({
            headers: {
                'Token': AppX.appConfig.xjxj,
                'departmentid': AppX.appConfig.departmentid,
                "range": AppX.appConfig.range
            },
            type: "POST",
            url: AppX.appConfig.xjapiroot.replace(/\/+$/, "") + config.URL_request,
            data: {
                "user_id": userid,
                "search_date": searchDate,
                "plan_state": "2,3,4,5"//2：正在执行，3：已完成，4：超时未完成，5：申请转移
                // "isvalid": 1
            },
            success: function (response) {

                if (response.code != 1) {
                    toast.Show(config.MSG_error);
                } else if (response.result.rows.length === 0) {
                    toast.Show(config.MSG_null);
                } else {
                    var rows = response.result.rows;
                    var mainPlanInfos = [];
                    for (var i = 0, length = rows.length; i < length; i++) {
                        var mainPlanInfo = {
                            "childPlanId": rows[i].child_plan_id, //巡检子计划id
                            "regionName": rows[i].region_name,//片区名
                            "beginDate": rows[i].plan_begindate.split(" ")[0], //巡检计划开始时间
                            "endDate": rows[i].plan_enddate.split(" ")[0],//巡检计划结束时间
                            "periodName": rows[i].period_name,//巡检方式
                            "deviceTypeName": rows[i].device_type_name,//巡检设备类型
                            "type": rows[i].type,//巡检类型
                            "percent": rows[i].percent,//计划完成量   
                        }
                        mainPlanInfos.push(mainPlanInfo);
                    }
                    callback(mainPlanInfos, targetID);
                }
            }.bind(this),
            error: function () {
                toast.Show(config.MSG_error);
            },
            dataType: "json",
        });
    }

    //初始化计划列表
    initWorkerAllPlanList(mainPlanInfos: Array<any>, targetID) {
        for (var i = 0, length = mainPlanInfos.length; i < length; i++) {
            var timtSpan = mainPlanInfos[i].beginDate.split("-")[1] + "-" + mainPlanInfos[i].beginDate.split("-")[2] + "->" + mainPlanInfos[i].endDate.split("-")[1] + "-" + mainPlanInfos[i].endDate.split("-")[2];//巡检周期
            var type = "";//巡检方式
            if (mainPlanInfos[i].type == 0) {
                type = "人巡";
            } else if (mainPlanInfos[i].type == 1) {
                type = "车巡";
            }
            //初始化主计划信息（片区，巡检方式，巡检日期，完成量）
            var html = "";
            var template = this.template.split("$$")[7];

            var textOfLink = mainPlanInfos[i].deviceTypeName + "(" + timtSpan + ")";
            var subTitle = mainPlanInfos[i].deviceTypeName + "(" + type + "," + mainPlanInfos[i].regionName + "," + mainPlanInfos[i].periodName + ")";
            var cllapseTarget = "mainplan" + mainPlanInfos[i].childPlanId;
            var complishPercent = (mainPlanInfos[i].percent * 100).toFixed(1) + "%";//巡检计划完成量
            var mainData = [mainPlanInfos[i].childPlanId, cllapseTarget, subTitle, textOfLink, complishPercent, complishPercent, cllapseTarget];

            var mainIndex = 0;
            html = template.replace(/%data/g, function () {
                return (mainIndex < mainData.length) ? (mainData[mainIndex++]) : ""
            });
            var selector = "." + this.baseClass + " .workerlist " + targetID;
            $(selector).append(html);
        }

        //绑定子计划查看事件
        this.domObj.find(".workerlist #workercheckpoint a.mainplan").on("click", function () {
            var mainPlanId = $(event.currentTarget).attr("mainplanid");
            var childPlanTargetID = $(event.currentTarget).attr("data-target");
            if ($(childPlanTargetID).hasClass("in")) {
                return;
            } else {
                //清除原有数据（地图数据、列表数据）
                var graphicLayer = <GraphicsLayer>this.map.getLayer("worker_historyCheckPointGraphicLayer");
                graphicLayer.clear();
                $(childPlanTargetID).find(".checkpoints *").remove();
                this.requestCheckedPoint(mainPlanId, childPlanTargetID, this.initWorkerCheckedPointList.bind(this))
            }

        }.bind(this));
    }


    //获取某个计划下的巡检点
    requestCheckedPoint(mainPlanId, childPlanTargetID, callBack) {
        var config = this.config.requestCheckedPoint;
        var toast = this.AppX.runtimeConfig.toast;
        $.ajax({
            headers: {
                'Token': AppX.appConfig.xjxj,
                'departmentid': AppX.appConfig.departmentid,
                "range": AppX.appConfig.range
            },
            type: "POST",
            url: AppX.appConfig.xjapiroot.replace(/\/+$/, "") + config.URL_request,
            data: {
                "child_plan_id": mainPlanId,
                "search_date": this.queryDate[0],
            },
            success: function (response) {
                if (response.code != 1) {
                    toast.Show(response.message);
                } else if (response.result[0].plan_child_points.length === 0) {
                    toast.Show(config.MSG_null);
                } else {
                    var rows = response.result[0].plan_child_points;
                    var childPlanInfos = [];
                    for (var i = 0, length = rows.length; i < length; i++) {
                        var childPlanInfo = {
                            "name": rows[i].name,//巡检点、巡检线等巡检设备名称
                            "deviceName": rows[i].device_type_name,//巡检设备类型（）
                            "geometry": rows[i].geometry,//图形
                            "isOver": rows[i].isover,//是否巡检
                            "overDate": rows[i].over_date//已检对应时间
                        }
                        childPlanInfos.push(childPlanInfo);
                    }

                    callBack(childPlanInfos, childPlanTargetID);
                }
            }.bind(this),
            error: function () {
                toast.Show(config.MSG_error);
            },
            dataType: "json",
        });
    }

    //初始化巡检计划列表
    initWorkerCheckedPointList(childPlanInfos: Array<any>, targetID) {
        //清除原有数据（地图数据、列表数据）
        var graphicLayer = <GraphicsLayer>this.map.getLayer("worker_historyCheckPointGraphicLayer");
        graphicLayer.clear();
        $(targetID).find(".checkpoints *").remove();
        //
        var itemHtml = "";
        for (var i = 0, length = childPlanInfos.length; i < length; i++) {
            //设备名称
            var name = "--";
            if (childPlanInfos[i].name !== "" && childPlanInfos[i].name !== null) {
                name = childPlanInfos[i].name;
            }
            //
            var devicePng = "";
            var checkedTime = "--";

            var state = childPlanInfos[i].isover;
            var geometryJson = "";//点、线、面
            geometryJson = childPlanInfos[i].geometry;
            var geometry;
            var symbol = undefined;
            if (/paths/.test(geometryJson)) {
                geometry = new Polyline(JSON.parse(geometryJson));
                if (childPlanInfos[i].isOver == 0) {//未检
                    devicePng = "pointChecking.png"
                    symbol = this.symbol.checkPoint.checkingPath;
                } else {//已检
                    devicePng = "pointChecked.png";
                    checkedTime = childPlanInfos[i].overDate.split(" ")[1];
                    symbol = this.symbol.checkPoint.checkedPath;
                }

            } else if (/rings/.test(geometry)) {
                geometry = new Polygon(JSON.parse(geometryJson));
                if (childPlanInfos[i].isOver == 0) {//未检
                    devicePng = "pointChecking.png"
                    symbol = this.symbol.checkPoint.checking;
                } else {//已检
                    devicePng = "pointChecked.png";
                    checkedTime = childPlanInfos[i].overDate.split(" ")[1];
                    symbol = this.symbol.checkPoint.checked;
                }

            } else {
                geometry = new Point(JSON.parse(geometryJson));
                if (childPlanInfos[i].isOver == 0) {//未检
                    devicePng = "pointChecking.png"
                    symbol = this.symbol.checkPoint.checkingPoint;
                } else {//已检
                    devicePng = "pointChecked.png";
                    checkedTime = childPlanInfos[i].overDate.split(" ")[1];
                    symbol = this.symbol.checkPoint.checkedPoint;
                }

            }
            var itemTemplate = this.template.split("$$")[8];
            var subName = name;
            if (subName.length > 4) {
                subName = subName.substr(0, 4) + "..."
            }
            var data = [devicePng, name + "(" + childPlanInfos[i].deviceName + ")", subName + "(" + childPlanInfos[i].deviceName + ")", checkedTime];
            var index = 0;
            var itemTemplateReplace = itemTemplate.replace(/%data/g, function () {
                return (index < data.length) ? (data[index++]) : "";
            });
            itemHtml += itemTemplateReplace;

            //添加巡检设备到地图
            var deviceGraphic = new Graphic(geometry, symbol);
            var checkPointGraphicLayer = <GraphicsLayer>this.map.getLayer("worker_historyCheckPointGraphicLayer");
            checkPointGraphicLayer.add(deviceGraphic);
        }
        this.domObj.find(".workerlist .relativeinfo " + targetID + " .checkpoints").append(itemHtml);
        //设置范围缩放
        var graphicLayer = <GraphicsLayer>this.map.getLayer("worker_historyCheckPointGraphicLayer")
        var extent = graphicsUtils.graphicsExtent(graphicLayer.graphics);
        if (extent != null && extent.getWidth() > 0.005) {
            this.map.setExtent(extent.expand(1.5));

        } else {
            var extentCenter = extent.getCenter()
            this.map.centerAndZoom(extentCenter, 11);
        }
    }






    /*
    * 查看单个巡检人员的轨迹并可以回放
    */

    //获取轨迹索引
    requestWorkerSectionPathIndex(userID, search_date, targetID, callback) {
        var config = this.config.requestWorkerSectionPathIndex;
        var toast = this.AppX.runtimeConfig.toast;
        $.ajax({
            headers: {
                'Token': AppX.appConfig.xjxj,
                'departmentid': AppX.appConfig.departmentid,
            },
            type: "POST",
            url: AppX.appConfig.xjapiroot.replace(/\/+$/, "") + config.URL_request,
            data: {

                "userid": userID,
                "start_date": search_date,
                "end_date": search_date

            },
            success: function (result) {
                if (result.code !== 1) {
                    toast.Show(config.MSG_error);
                } else if (result.result === "当前用户无轨迹") {
                    toast.Show(config.MSG_Null);
                    return;
                } else {
                    callback(result, userID, targetID);
                }

            }.bind(this),
            error: function () {
                toast.Show(config.MSG_error);
            },
            dataType: "json",
        });

    }

    //获取巡检人轨迹回调函数
    requestWorkerSectionPathCallBack(result, userid, targetID) {
        //添加所有轨迹到地图
        // this.addWorkerPathToMap();
        //初始化巡检分段回放界面
        this.initPathPlayerInterface(result, userid, targetID);
    }

    //初始化轨迹播放界面
    initPathPlayerInterface(result, userid, targetID) {
        var totalCount = result.result[0].ret.length;//分了几段
        var gpsDatas = result.result[0].ret;
        var html = "";
        for (var i = 0, length = gpsDatas.length; i < length; i++) {
            var partName = gpsDatas[i].split(" ")[0];
            var timeSpan = gpsDatas[i].split(" ")[1];
            var template = $(".XJHistoryQuery-result .workerlist #workerpathetemplate").text().trim();
            var data = [userid, i + 1, partName, timeSpan];
            var index = 0;
            var templateReplace = template.replace(/%data/g, function () {
                return (index < data.length) ? (data[index++]) : ""
            });
            html += templateReplace;
        }
        var selector = ".XJHistoryQuery-result  .workerlist " + targetID;
        $(selector).append(html);

        //轨迹播放绑定事件
        $(selector).find("img").bind("click", function (event) {
            var section = $(event.currentTarget).attr("section");
            var userID = $(event.currentTarget).attr("userid");
            var userName = $(event.currentTarget).parents("div.item").find("a.workername").text();
            var playState = $(event.currentTarget).attr("playstate");
            this.pathPlayImgObj = $(event.currentTarget);
            /*
            *如果未播放轨迹，在回调函数中设置点击的轨迹播放图片状态为play
            * 如果为播放轨迹，点击的轨迹播放图片状态为stop
            */
            if (playState === "stop") {
                $(selector).find("img").attr("playstate", "stop");
                $(selector).find("img").attr("src", "widgets/XJHistoryQuery/css/img/player.png");
                this.AppX.runtimeConfig.routeplayer.Hide();
                //请求某段轨迹
                var pathShowGraphicLayer = <GraphicsLayer>this.map.getLayer("worker_historyPathShowGraphicLayer");
                pathShowGraphicLayer.clear();
                var pathMoveGraphicLayer = <GraphicsLayer>this.map.getLayer("worker_historyPathMoveGraphicLayer");
                pathMoveGraphicLayer.clear();
                this.requestWorkerSectionPath(userID, userName, section, this.queryDate[0], targetID, this.requestSectionWorkerPathCallBack.bind(this));
            } else {
                $(selector).find("img").attr("playstate", "stop");
                $(selector).find("img").attr("src", "widgets/XJHistoryQuery/css/img/player.png");
                this.animationQueue.stop();
            }
        }.bind(this))
    }


    //获取单个巡检员的所有轨迹
    requestWorkerPath(userid, uploadtime1, uploadtime2, callBack) {
        var config = this.config.requestWorkerPath;
        var toast = this.AppX.runtimeConfig.toast;
        $.ajax({
            headers: {
                'Token': AppX.appConfig.xjxj,
                'departmentid': AppX.appConfig.departmentid,
                "range": AppX.appConfig.range
            },
            type: "POST",
            url: AppX.appConfig.xjapiroot.replace(/\/+$/, "") + config.URL_request,
            data: {
                "pageindex": 1,
                "pagesize": 1000000,
                "userid": userid,
                "uploadtime1": uploadtime1,
                "uploadtime2": uploadtime2


            },
            success: function (result) {
                if (result.code !== 1) {
                    toast.Show(config.MSG_error);
                } else if (result.result.rows.length === 0) {
                    return;
                } else {
                    callBack(result);
                }

            }.bind(this),
            error: function () {
                toast.Show(config.MSG_error);
            },
            dataType: "json",
        });

    }

    //添加所有轨迹到图层
    addWorkerAllPathToMap(result) {
        var config = this.config.addWorkerAllPathToMap;
        var allPathGraphicLayer = <GraphicsLayer>this.map.getLayer("worker_historyAllPathGraphicLayer");
        allPathGraphicLayer.clear();
        var path = result.result.rows[0].guiji;
        var linePath: Array<any> = [];
        var lineSymbol = new SimpleLineSymbol({
            color: new Color(this.watchingSetting._workerPathColor),
            style: "solid",   //线的样式 dash|dash-dot|solid等	
            width: this.watchingSetting.pathLineWith
        });
        var carLineSymbol = new SimpleLineSymbol({
            color: new Color(this.watchingSetting._carPathColor),
            style: "solid",   //线的样式 dash|dash-dot|solid等	
            width: this.watchingSetting.pathLineWith
        });
        var allPolyline = [];
        for (var i = 0, length = path.length; i < length; i++) {
            // var pathPoint = [];
            // pathPoint.push(path[i].location_longitude);
            // pathPoint.push(path[i].location_latitude);
            // linePath.push(pathPoint);
            var pathPoint = [];
            if (i == 0 || path[i].gps_type == path[i - 1].gps_type) {
                pathPoint.push(path[i].location_longitude);
                pathPoint.push(path[i].location_latitude);
                linePath.push(pathPoint);
                //处理最后一段
                if (i == path.length - 1) {
                    if (path[i - 1].gps_type === 0) {
                        symbol = lineSymbol;
                    } else if (path[i - 1].gps_type === 1) {
                        symbol = carLineSymbol;
                    }
                    //添加线
                    var polyline = new Polyline({
                        "paths": [linePath],
                        "spatialReference": this.map.spatialReference
                    });
                    var lineGraphic = new Graphic(polyline, symbol);
                    allPathGraphicLayer.add(lineGraphic);
                    allPolyline.push(polyline);
                }
            } else if (path[i].gps_type !== path[i - 1].gps_type) {
                var symbol = undefined;
                if (path[i - 1].gps_type === 0) {
                    symbol = lineSymbol;
                } else if (path[i - 1].gps_type === 1) {
                    symbol = carLineSymbol;
                }
                //添加线
                var polyline = new Polyline({
                    "paths": [linePath],
                    "spatialReference": this.map.spatialReference
                });
                var lineGraphic = new Graphic(polyline, symbol);
                allPathGraphicLayer.add(lineGraphic);
                pathPoint = [];
                linePath = [];
                pathPoint.push(path[i].location_longitude);
                pathPoint.push(path[i].location_latitude);
                linePath.push(pathPoint);
                allPolyline.push(polyline);
            }

        }
        //起点添加
        var startx = linePath[0][0];
        var starty = linePath[0][1];
        var startPoint = new Point(startx, starty, this.map.spatialReference);
        var startPointSymbol = new PictureMarkerSymbol(this.root + config.IMG_startpoint, 23, 23);
        var startPointGraphic = new Graphic(startPoint, startPointSymbol);
        allPathGraphicLayer.add(startPointGraphic);
        //终点添加
        var endx = linePath[linePath.length - 1][0];
        var endy = linePath[linePath.length - 1][1];
        var endPoint = new Point(endx, endy, this.map.spatialReference);
        var endPointSymbol = new PictureMarkerSymbol(this.root + config.IMG_endpoint, 23, 23);
        var endPointGraphic = new Graphic(endPoint, endPointSymbol);
        allPathGraphicLayer.add(endPointGraphic);
        //定位到轨迹范围
        var extent = graphicsUtils.graphicsExtent(allPathGraphicLayer.graphics);
        if (extent != null && extent.getWidth() > 0.005) {
            this.map.setExtent(extent.expand(1.5));

        } else {
            var extentCenter = extent.getCenter()
            this.map.centerAndZoom(extentCenter, 11);
        }
    }


    //获取巡检人轨迹
    requestWorkerSectionPath(userid, userName, section, searchDate, targetID, callBack) {
        var config = this.config.requestWorkerSectionPath;
        var toast = this.AppX.runtimeConfig.toast;
        $.ajax({
            headers: {
                'Token': AppX.appConfig.xjxj,
                'departmentid': AppX.appConfig.departmentid,
            },
            type: "POST",
            url: AppX.appConfig.xjapiroot.replace(/\/+$/, "") + config.URL_request,
            data: {
                "userid": userid,
                "section": section,
                "search_date": searchDate
            },
            success: function (result) {
                if (result.code !== 1) {
                    toast.Show(config.MSG_error);
                } else if (result.result === "当前用户无轨迹") {
                    toast.Show(config.MSG_null);
                    return;
                } else {
                    callBack(result, userid, userName, targetID);
                }

            }.bind(this),
            error: function () {
                toast.Show(config.MSG_error);
            },
            dataType: "json",
        });
    }


    //获取分段轨迹回调函数
    requestSectionWorkerPathCallBack(result, userid, userName) {
        var pathPlayerConfig = {
            "userlinecolor": this.watchingSetting._workerPathColor,//人巡轨迹颜色，16进制字符串
            "carlinecolor": this.watchingSetting._carPathColor,//车巡轨迹颜色
            "playpointcolor": this.watchingSetting.pathPointColor,//播放轨迹点颜色
            "playlinecolor": this.watchingSetting.pathLineColor,//播放轨迹线颜色
            "pointsieze": parseInt(this.watchingSetting.pathPointWith),//轨迹点大小
            "linezise": parseInt(this.watchingSetting.pathLineWith) //轨迹线宽度
        }
        this.AppX.runtimeConfig.routeplayer.Show(result.result.gps, pathPlayerConfig);
        this.pathPlayImgObj.attr("playstate", "play");
        this.pathPlayImgObj.prop("src", "widgets/XJHistoryQuery/css/img/play.png");
        // this.pathPlayerResult = result;
        // //添加分段轨迹到地图上
        // this.addSectionPathToMap(result);
        // //回放轨迹
        // this.playWorerPath(userName);
    }

    //添加分段轨迹到地图
    addSectionPathToMap(result) {
        //清除原有的轨迹点
        var pathShowGraphicLayer = <GraphicsLayer>this.map.getLayer("worker_historyPathShowGraphicLayer");
        pathShowGraphicLayer.clear();
        var lineSymbol = new SimpleLineSymbol({
            color: new Color(this.watchingSetting.pathLineColor),
            style: "solid",   //线的样式 dash|dash-dot|solid等	
            width: this.watchingSetting.pathLineWith
        });
        //添加轨迹线
        var path = result.result.gps;
        var linePath: Array<any> = [];
        for (var i = 0, length = path.length; i < length; i++) {
            var pathPoint = [];
            pathPoint.push(path[i].location_longitude);
            pathPoint.push(path[i].location_latitude);
            linePath.push(pathPoint);
        }
        var polyline = new Polyline({
            "paths": [linePath],
            "spatialReference": this.map.spatialReference
        });
        var lineGraphic = new Graphic(polyline, lineSymbol);
        pathShowGraphicLayer.add(lineGraphic);
        //添加轨迹点
        var currentPoint = new SimpleMarkerSymbol(
            {
                color: new Color("#FFFFFF"),
                style: "cross",       //点样式square|diamond|circle|x
                outline: {
                    color: new Color(this.watchingSetting.pathPointColor),
                    width: 2
                },
                size: this.watchingSetting.pathPointWith
            }
        );
        var startPoint = new Point(path[0].location_longitude, path[0].location_latitude, this.map.spatialReference);//轨迹起点
        for (var i = 1, length = path.length; i < length - 1; i++) {
            var point = new Point(path[i].location_longitude, path[i].location_latitude, this.map.spatialReference);
            var graphic = new Graphic(point, currentPoint);
            pathShowGraphicLayer.add(graphic);
        }
        //定位到轨迹范围

        var extent = graphicsUtils.graphicsExtent(pathShowGraphicLayer.graphics);
        if (extent != null && extent.getWidth() > 0.005) {
            this.map.setExtent(extent.expand(1.5));

        } else {
            var extentCenter = extent.getCenter()
            this.map.centerAndZoom(extentCenter, 11);
        }

    }


    //回放轨迹
    playWorerPath(userName) {
        this.animationQueue = new AnimationQueue(null);
        this.playPointX = [];
        this.playPointY = [];
        this.xspan = [];
        this.yspan = [];
        this.pathindex = 0;
        var info = this.pathPlayerResult.result.gps;
        for (var i = 1, length = info.length; i < length; i++) {
            var startTime = Date.now();
            var gpsTimespan = 3000;
            var latitude = info[i].location_latitude;//x
            var longitude = info[i].location_longitude;
            var startPoint = [info[i - 1].location_longitude, info[i - 1].location_latitude];
            var endPoint = [longitude, latitude];
            var xspan = endPoint[0] - startPoint[0];
            var yspan = endPoint[1] - startPoint[1];
            this.playPointX.push(startPoint[0]);
            this.playPointY.push(startPoint[1]);
            this.xspan.push(xspan);
            this.yspan.push(yspan);
            var handleFunction = this.getHandleFunction(startPoint, xspan, yspan, userName).bind(this);
            var animation = new Animation(3000, handleFunction.bind(this), null);
            this.animationQueue.append(animation);
        }
        this.animationQueue.flush();
    }

    //轨迹回放回调函数
    getPersonalPathPlayer(event, userName) {
        var animationQueue = new AnimationQueue(null);
        this.playPointX = [];
        this.playPointY = [];
        this.xspan = [];
        this.yspan = [];
        this.pathindex = 0;
        var info = this.pathPlayerResult.result.rows;
        for (var i = 1, length = info.length; i < length; i++) {
            var startTime = Date.now();
            var gpsTimespan = 3000;
            var latitude = info[i].location_latitude;//x
            var longitude = info[i].location_longitude;
            var startPoint = [info[i - 1].location_longitude, info[i - 1].location_latitude];
            var endPoint = [longitude, latitude];
            var xspan = endPoint[0] - startPoint[0];
            var yspan = endPoint[1] - startPoint[1];
            this.playPointX.push(startPoint[0]);
            this.playPointY.push(startPoint[1]);
            this.xspan.push(xspan);
            this.yspan.push(yspan);
            var handleFunction = this.getHandleFunction(startPoint, xspan, yspan, userName).bind(this);
            var animation = new Animation(3000, handleFunction.bind(this), null);
            animationQueue.append(animation);
        }
        animationQueue.flush();

    }

    //返回每段的轨迹处理函数
    getHandleFunction(startPoint, xspan, yspan, userName) {
        var handleFunction = function (p) {
            var pathMoveGraphicLayer = <GraphicsLayer>this.map.getLayer("worker_historyPathMoveGraphicLayer");
            var x = startPoint[0] + xspan * p;
            var y = startPoint[1] + yspan * p;
            pathMoveGraphicLayer.clear();
            var point = new Point(x, y, this.map.spatialReference);
            var graphic = new Graphic(point, this.symbol.pathPlayer);
            pathMoveGraphicLayer.add(graphic);
            var textSymbol = new TextSymbol({
                text: userName,
                color: new Color("#2690bf"),
                haloSize: 5,
                yoffset: -30

            })
            textSymbol.haloColor = new Color("#dddddd");//光环颜色
            var textGrphic = new Graphic(point, textSymbol);
            pathMoveGraphicLayer.add(textGrphic);
        }
        return handleFunction;
    }






    /*
  * 可通过部门或人员状态进行筛选。
  * 
  */



    //显示符合条件的人员列表
    displayQualifiedUser(departmentId, userState) {
        if (departmentId === "allDepartment" && userState === "allState") {
            this.domObj.find("div.workerlist div.item").css("display", "block")
        } else if (departmentId === "allDepartment" && userState !== "allState") {
            this.domObj.find("div.workerlist div.item").attr("userstate", function (index, val) {
                if (val === userState) {
                    $(this).css("display", "block")
                    return val;
                } else {
                    $(this).css("display", "none")
                    return val;
                }
            });
        } else if (departmentId !== "allDepartment" && userState === "allState") {
            this.domObj.find("div.workerlist div.item").attr("departmentid", function (index, val) {
                if (val === departmentId) {
                    $(this).css("display", "block")
                    return val;
                } else {
                    $(this).css("display", "none")
                    return val;
                }
            });
        } else {
            this.domObj.find("div.workerlist div.item").attr("userstate", function (index, val) {
                var itemDepartmentId = $(this).attr("departmentid");
                if (val == userState && itemDepartmentId === departmentId) {
                    $(this).css("display", "block")
                    return val;
                } else {
                    $(this).css("display", "none")
                    return val;
                }
            });
        }
    }





    //显示某部门下的所有巡检员
    dispalyUserOfTheDepartment(departmentid) {
        $(".XJHistoryQuery-result  div.workerlist div.item").attr("departmentid", function (index, val) {
            if (departmentid === "allDepartment") {
                $(this).css("display", "block")
                return val;
            } else {
                if (val !== departmentid) {
                    $(this).css("display", "none")
                    return val;
                } else {
                    $(this).css("display", "block")
                    return val;
                }
            }
        })
    }


    //显示某种状态下的所有巡检员
    selectUserState(userState) {
        $(".XJHistoryQuery-result div.workerlist div.item").attr("userstate", function (index, val) {
            /*
            *如果select属性值为departmentid，显示所有的巡检人员
            * 如果不是，则显示巡检人员列表项的部门属性值与select属性值相同的
            */
            if (userState === "allState") {
                $(this).css("display", "block")
                return val;
            } else if (val !== userState) {
                $(this).css("display", "none")
                return val;
            } else {
                $(this).css("display", "block")
                return val;
            }

        });
    }

    //显示某个部门上传的隐患
    displayHidedangerOfTheDepartment(departmentid) {
        $(".XJHistoryQuery-result  div.hidedangerlist div.item").attr("departmentid", function (index, val) {
            if (departmentid === "allDepartment") {
                $(this).css("display", "inline-flex")
                return val;
            } else {
                if (val !== departmentid) {
                    $(this).css("display", "none")
                    return val;
                } else {
                    $(this).css("display", "inline-flex")
                    return val;
                }
            }
        })
    }

    //显示某个用户上传的隐患
    displayHidedangerOfUser(departmentid, userid) {
        var hidedangerlistItemObj = $(".XJHistoryQuery-result   div.hidedangerlist div.item");
        if (userid === "allWorker") {
            hidedangerlistItemObj.attr("departmentid", function (index, val) {
                if (departmentid === "allDepartment") {
                    $(this).css("display", "inline-flex")
                    return val;
                } else {
                    if (val !== departmentid) {
                        $(this).css("display", "none")
                        return val;
                    } else {
                        $(this).css("display", "inline-flex")
                        return val;
                    }
                }

            });
        } else {
            hidedangerlistItemObj.attr("userid", function (index, val) {
                if (val !== userid) {
                    $(this).css("display", "none")
                    return val;
                } else {
                    $(this).css("display", "inline-flex")
                    return val;
                }

            })
        }
    }


    /*
     * 初始化图层管理模块
     */
    initBaseLayerInfo(companyId) {
        //添加graphic到图层
        this.addBaseLayerToLayer(companyId);
        //选择截至今天还是今天图层数据切换事件
        this.domObj.find(".pipe-layers-control input").on("click", function (event) {
            var layerId = [];
            layerId.push($(event.currentTarget).parents("li").attr('layerName'));
            var dataType = $(event.currentTarget).attr("datatype");
            this.switchLayerData(dataType, layerId);
        }.bind(this));
    }


    addBaseLayerToLayer(companyId) {
        var config = this.config.initBaseLayer;
        //查询当天所有巡检员信息
        this.requestAllWorkerInfo(companyId, AppX.appConfig.groupid, 1, 10000, this.queryDate[0], this.initAllWorkInfo.bind(this));
        //查询当天上报的所有隐患
        this.requestHideDangerInfo(companyId, AppX.appConfig.groupid, 1, 10000, this.queryDate[0], 0, this.initHideDangerInfo.bind(this));
        var headers = {
            'Token': AppX.appConfig.xjxj,
            'departmentid': AppX.appConfig.departmentid,
        };

        // //第三方工地图层
        // // this.historyBuildSiteGraphicLayer = new XJGraphicLayer(this.map, config.buildsite_layerid);
        // var buildSiteUrl = AppX.appConfig.xjapiroot.replace(/\/+$/, "") + config.URL_buildsite;
        // var data = {
        //     "pageindex": 1,
        //     "pagesize": 100000,
        //     "search_date": this.queryDate[0],
        //     "check_state": "0,2",
        //     "monitor_state": 0
        // };
        // var buildSiteInfoInterface = new BackGroundInterface(buildSiteUrl, headers, data, this.requestBuildSiteInfoCallback.bind(this));
        // //巡检点
        // var xjPointUrl = AppX.appConfig.xjapiroot.replace(/\/+$/, "") + config.URL_xjpoint;
        // var xjpointData = {
        //     "pageindex": 1,
        //     "pagesize": 100000,
        //     "device_type_id": 1,
        //     "search_date": this.queryDate[0],
        //     "monitor_state": 1
        // };
        // var xjPointInfoInterface = new BackGroundInterface(xjPointUrl, headers, xjpointData, this.requestXJpointInfoCallback.bind(this));
        // //巡检线
        // // this.historyXjLineGraphicLayer = new XJGraphicLayer(this.map, config.xjline_layerid);
        // var xjLineUrl = AppX.appConfig.xjapiroot.replace(/\/+$/, "") + config.URL_xjpoint;
        // var xjLineData = {
        //     "pageindex": 1,
        //     "pagesize": 100000,
        //     "device_type_id": 6,
        //     "search_date": this.queryDate[0],
        //     "monitor_state": 1
        // };
        // var xjLineInfoInterface = new BackGroundInterface(xjLineUrl, headers, xjLineData, this.requestXJLineInfoCallback.bind(this));
        // //巡检片区
        // // this.historyXjRegionGraphicLayer = new XJGraphicLayer(this.map, config.xjregion_layerid);
        // var xjRegionUrl = AppX.appConfig.xjapiroot.replace(/\/+$/, "") + config.URL_region;
        // var xjRegionData = {
        //     "pageindex": 1,
        //     "pagesize": 100000,
        //     "search_date": this.queryDate[0],
        //     "monitor_state": 1
        // };
        // var xjLineInfoInterface = new BackGroundInterface(xjRegionUrl, headers, xjRegionData, this.requestXJRegionInfoCallback.bind(this));

    }

    requestBuildSiteInfoCallback(result) {
        var config = this.config.requestBuildSiteInfoCallback;
        var symbol = new PictureMarkerSymbol(this.root + config.URL_symbol, 50, 50)
        var buildSiteGraphicLayer = <GraphicsLayer>this.map.getLayer("historyGraphicLayer_buildsite");
        var rows = result.result.rows;
        for (var i = 0, length = rows.length; i < length; i++) {
            var x = rows[i].lng;
            var y = rows[i].lat;
            var point = new Point(x, y, this.map.spatialReference);
            var graphic = new Graphic(point, symbol);
            var creatTime = rows[i].create_time.split(" ")[0];
            graphic.setAttributes({
                "time": creatTime
            });
            buildSiteGraphicLayer.add(graphic);
        }
    }

    requestXJpointInfoCallback(result) {
        var config = this.config.requestXJpointInfoCallback;
        var symbol = new PictureMarkerSymbol(this.root + config.URL_symbol, 50, 50);
        var XJpointGraphicLayer = <GraphicsLayer>this.map.getLayer("historyGraphicLayer_xjpoint");
        var rows = result.result.rows;
        var points = [];
        for (var i = 0, length = rows.length; i < length; i++) {
            var x = rows[i].lng;
            var y = rows[i].lat;
            var point = new Point(x, y, this.map.spatialReference);
            var graphic = new Graphic(point, symbol);
            var creatTime = rows[i].create_time.split(" ")[0];
            graphic.setAttributes({
                "time": creatTime
            });
            XJpointGraphicLayer.add(graphic);
        }
    }

    requestXJLineInfoCallback(result) {
        var config = this.config.requestXJLineInfoCallback;
        var symbol = new SimpleLineSymbol({
            color: new Color("#FF0000"),
            style: "solid",   //线的样式 dash|dash-dot|solid等	
            width: 2
        })
        var XJLineGraphicLayer = <GraphicsLayer>this.map.getLayer("historyGraphicLayer_xjline");
        var rows = result.result.rows;
        var polylines = [];
        for (var i = 0, length = rows.length; i < length; i++) {
            var polyline = new Polyline(JSON.parse(rows[i].geometry));
            var graphic = new Graphic(polyline, symbol);
            var creatTime = rows[i].create_time.split(" ")[0];
            graphic.setAttributes({
                "time": creatTime
            });
            XJLineGraphicLayer.add(graphic);
        }
    }

    requestXJRegionInfoCallback(result) {
        var config = this.config.requestXJRegionInfoCallback;
        var symbol = new SimpleFillSymbol(SimpleFillSymbol.STYLE_SOLID, new SimpleLineSymbol(SimpleLineSymbol.STYLE_DASHDOT, new Color([255, 0, 0]), 2), new Color([0, 0, 0, 0.1]));
        var XJRegionGraphicLayer = <GraphicsLayer>this.map.getLayer("historyGraphicLayer_xjregion");
        var rows = result.result.rows;
        var polygons = [];
        for (var i = 0, length = rows.length; i < length; i++) {
            if (rows[i].geometry !== "") {
                var polygon = new Polygon(JSON.parse(rows[i].geometry));
                var graphic = new Graphic(polygon, symbol);
                var creatTime = rows[i].updatetime.split(" ")[0];
                graphic.setAttributes({
                    "time": creatTime
                });
                XJRegionGraphicLayer.add(graphic);
                //添加片区名
            }
        }
    }

    switchLayerData(dataType, baseLayerIds: Array<string>) {
        var config = this.config.switchLayerData;
        if (dataType === "today") {
            for (var i = 0, length = baseLayerIds.length; i < length; i++) {
                var graphicLayer = <GraphicsLayer>this.map.getLayer(baseLayerIds[i]);
                graphicLayer.clear();
                if (baseLayerIds[i] == "historyGraphicLayer_hidedanger") {
                    //今天上报的所有隐患
                    var requestCompanyId = this.domObj.find(".companySelect option:selected").val();
                    var departmentid = this.domObj.find("#worker .department option:selected").val();
                    if (departmentid == "allDepartment") {
                        departmentid = "";
                    }
                    this.requestHideDangerInfo(requestCompanyId, "", 1, 10000, this.queryDate[0], 0, this.initHideDangerInfo.bind(this));
                } else if (baseLayerIds[i] == "historyGraphicLayer_buildsite") {
                    var headers = {
                        'Token': AppX.appConfig.xjxj,
                        'departmentid': AppX.appConfig.departmentid,
                        "range": AppX.appConfig.range
                    };
                    //第三方工地图层
                    var requestCompanyId = this.domObj.find(".companySelect option:selected").val();
                    var buildSiteUrl = AppX.appConfig.xjapiroot.replace(/\/+$/, "") + config.URL_buildsite;
                    var data = {
                        "pageindex": 1,
                        "pagesize": 100000,
                        "search_date": this.queryDate[0],
                        "check_state": "0,2",
                        "monitor_state": 0,
                        "companyid": requestCompanyId
                    };
                    var buildSiteInfoInterface = new BackGroundInterface(buildSiteUrl, headers, data, this.requestBuildSiteInfoCallback.bind(this));
                }
            }

        } else if (dataType === "untiltoday") {
            for (var i = 0, length = baseLayerIds.length; i < length; i++) {
                var graphicLayer = <GraphicsLayer>this.map.getLayer(baseLayerIds[i]);
                graphicLayer.clear();
                if (baseLayerIds[i] == "historyGraphicLayer_hidedanger") {
                    //今天上报的所有隐患
                    var requestCompanyId = this.domObj.find(".companySelect option:selected").val();
                    var departmentid = this.domObj.find("#worker .department option:selected").val();
                    if (departmentid == "allDepartment") {
                        departmentid = "";
                    }
                    this.requestHideDangerInfo(requestCompanyId, "", 1, 10000, this.queryDate[0], 1, this.initHideDangerInfo.bind(this));
                }
                else if (baseLayerIds[i] == "historyGraphicLayer_buildsite") {
                    var headers = {
                        'Token': AppX.appConfig.xjxj,
                        'departmentid': AppX.appConfig.departmentid,
                        "range": AppX.appConfig.range
                    };
                    //第三方工地图层
                    var requestCompanyId = this.domObj.find(".companySelect option:selected").val();
                    var buildSiteUrl = AppX.appConfig.xjapiroot.replace(/\/+$/, "") + config.URL_buildsite;
                    var data = {
                        "pageindex": 1,
                        "pagesize": 100000,
                        "search_date": this.queryDate[0],
                        "check_state": "0,2",
                        "monitor_state": 1,
                        "companyid": requestCompanyId
                    };
                    var buildSiteInfoInterface = new BackGroundInterface(buildSiteUrl, headers, data, this.requestBuildSiteInfoCallback.bind(this));
                }

            }
        }



    }


    /*人员、隐患列表添加分页 */

    //人员信息分页
    workerListPageTurning(event) {
        var pageTurningTyp = $(event.currentTarget).attr("pageturntype");
        var currentPage = parseInt($(event.currentTarget).parents(".workerpagination").find(".currentpagenumber").text());
        var allPage = parseInt($(event.currentTarget).parents(".workerpagination").find(".allpagenumber").text());
        var requestCompanyId = this.domObj.find(".companySelect option:selected").val();
        var departmentid = this.domObj.find("#worker .department option:selected").val();
        if (departmentid == "allDepartment") {
            departmentid = "";
        }
        if (pageTurningTyp == "prepage") {
            if ((currentPage - 1) > 0) {
                this.requestAllWorkerInfo(requestCompanyId, departmentid, (currentPage - 1), 10, this.queryDate[0], this.initAllWorkInfo.bind(this));
            }
        } else if (pageTurningTyp == "nextpage") {
            if ((currentPage + 1) > 0 && (currentPage + 1) < allPage + 1) {
                this.requestAllWorkerInfo(requestCompanyId, departmentid, (currentPage + 1), 10, this.queryDate[0], this.initAllWorkInfo.bind(this));
            }
        } else if (pageTurningTyp == "gopage") {
            var goPage = parseInt($(event.currentTarget).parents(".go").find(".gopage").val());
            if (goPage > 0 && goPage < allPage + 1) {
                this.requestAllWorkerInfo(requestCompanyId, departmentid, goPage, 10, this.queryDate[0], this.initAllWorkInfo.bind(this));
            }
        }

    }
    //隐患信息分页
    hidedangerListPageTurning(event) {
        var pageTurningTyp = $(event.currentTarget).attr("pageturntype");
        var currentPage = parseInt($(event.currentTarget).parents(".hidedangerpagination").find(".currentpagenumber").text());
        var allPage = parseInt($(event.currentTarget).parents(".hidedangerpagination").find(".allpagenumber").text());
        var requestCompanyId = this.domObj.find(".companySelect option:selected").val();
        var departmentid = this.domObj.find("#worker .department option:selected").val();
        if (departmentid == "allDepartment") {
            departmentid = "";
        }
        if (pageTurningTyp == "prepage") {
            if ((currentPage - 1) > 0) {
                this.requestHideDangerInfo(requestCompanyId, "", (currentPage - 1), 10, this.queryDate[0], 0, this.initHideDangerInfo.bind(this));

            }
        } else if (pageTurningTyp == "nextpage") {
            if ((currentPage + 1) > 0 && (currentPage + 1) < allPage + 1) {
                this.requestHideDangerInfo(requestCompanyId, "", (currentPage + 1), 10, this.queryDate[0], 0, this.initHideDangerInfo.bind(this));
            }
        } else if (pageTurningTyp == "gopage") {
            var goPage = parseInt($(event.currentTarget).parents(".go").find(".gopage").val());
            if (goPage > 0 && goPage < allPage + 1) {
                this.requestHideDangerInfo(requestCompanyId, "", goPage, 10, this.queryDate[0], 0, this.initHideDangerInfo.bind(this));
            }
        }
    }
}


class Animation {
    timespan: number; //时间间隔
    progress: Function; //处理函数
    easing: Function;  // 
    constructor(timespan, process, easing) {
        this.timespan = timespan;
        this.progress = process;
        this.easing = easing || function (p) { return p };
    }
    public start(finished) {
        var startTime = Date.now();//动画开始时间
        var timeSpan = this.timespan;//时间间隔
        var next = true;
        var self = this;
        requestAnimationFrame(function step() {
            var p = (Date.now() - startTime) / timeSpan;
            var next = true;

            if (p < 1.0) {
                self.progress(self.easing(p), p);
            } else {
                if (typeof finished === 'function') {
                    next = finished() === false;
                } else {
                    next = finished === false;
                }

                if (!next) {
                    self.progress(self.easing(1.0), 1.0);
                } else {
                    startTime += timeSpan;
                    self.progress(self.easing(p), p);
                }
            }

            if (next) requestAnimationFrame(step);
        });
    }


}


class AnimationQueue {
    animation;
    state = "play";
    constructor(animation) {
        this.animation = animation || [];
    }
    public append(animation) {
        var args = [].slice.call(arguments);
        this.animation.push.apply(this.animation, args);
    }
    public flush() {
        if (this.animation.length) {
            this.play();
        } else {
            return;
        }
    }
    public play() {
        if (this.state === "play") {
            var animator = this.animation.shift();
            var that = this;
            animator.start(function () {
                if (that.animation.length) {
                    that.play();
                }
            });
        } else {
            return;
        }
    }
    public pause() {
        this.state = "pause";
    }
    public recover() {
        this.state = "play";
    }
    public stop() {
        this.animation = [];
    }
}


class Worker {
    ID: string;//巡检人员ID
    workerName: string;//巡检人姓名
    avatar: string;//上传的头像
    departmentID: string;//所属部门ID
    departmentName: string;//所属部门名称
    longitude: number;//最新的经度
    latitude: number;//最新的纬度
    onTime: string;//上班时间
    offTime: string;//下班时间
    gpsState: number;//最新的Gps状态
    netState: number;//最新的net状态
    state: string = undefined;//人员状态（未上班:noWork，上班-正常:workNormal，上班-GPS异常:workGpsError，上班-网络异常:workNetError，下班:offWork）
    constructor(ID, workerName, avatar, departmentID, departmentName, longitude, latitude, onTime, offTime, gpsState, netState) {
        this.ID = ID;
        this.workerName = workerName;
        this.avatar = avatar;
        this.departmentID = departmentID;
        this.departmentName = departmentName;
        this.longitude = longitude;
        this.latitude = latitude;
        this.onTime = onTime;
        this.offTime = offTime;
        this.gpsState = gpsState;
        this.netState = netState;
        //处理用户状态
        this.handleUserState();
        //处理头像
        this.handleAvatar();
    }
    private handleUserState() {
        if (this.onTime === null) {
            this.state = "noWork";
        } else if (this.offTime !== null) {
            this.state = "offWork";
        } else {
            if (this.gpsState == 1 && this.netState == 1) {
                this.state = "workNormal";
            } else if (this.gpsState == 0 && this.netState == 1) {
                this.state = "workGpsError";
            } else {
                this.state = "workNetError";
            }
        }
    }

    private handleAvatar() {

    }
}

/*隐患类 */
class Hidedanger {
    //上报人员信息
    finder: string;//上报人员
    _finderId: string;//上报人员id
    departmentId: string;//上报人员部门id
    departmentName: string;//上报人员部门
    //隐患信息
    type: string;//隐患类型
    picture: string;//隐患发现图片
    minPicture: string;//隐患发现图片缩略图
    audio: string;//音频
    findNotes: string;//发现时上传的备注
    address: string;//隐患地址
    longitude: number;//经度
    latitude: number;//纬度
    findTime: string;//隐患发现时间
    //隐患处理流程信息
    handleProcess: string;//处于哪个流程
    minClearPicture: string;//隐患清除照片缩略图
    clearPicture: string;//隐患清除照片
    clearNotes: string;//处理后备注
    constructor(finder, finderId, departmentId, departmentName, type, minPicture, picture, audio, findNotes, address, longitude, latitude, findTime, handleProcess, minClearPicture, clearPicture, clearNotes) {
        this.finder = finder;
        this._finderId = finderId;
        this.departmentId = departmentId;
        this.departmentName = departmentName;
        this.type = type;
        this.minPicture = minPicture;
        this.picture = picture;
        this.audio = audio;
        this.findNotes = findNotes;
        this.address = address;
        this.longitude = longitude;
        this.latitude = latitude;
        this.findTime = findTime;
        this.handleProcess = handleProcess;
        this.clearPicture = clearPicture;
        this.minClearPicture = minClearPicture;
        this.clearNotes = clearNotes;
    }

    public getHideDangerListData() {
        //[上报人员部门，上报人，经度，纬度，标题（隐患类型-上报人），隐患类型，隐患发现时间，隐患地址，隐患地址缩写，处理流程,隐患发现图片，隐患清除照片]
        var data = [];

        var oneFindImgSrc = AppX.appConfig.xjapiroot.substr(0, AppX.appConfig.xjapiroot.length - 3) + this.picture.split(",")[0];//发现隐患图片（多张只取第一张）
        var findPictureObjArray = [];
        if (this.picture !== "") {
            var findPictureSrc = this.picture.split(",");
            var minFindPictureSrc = this.minPicture.split(",");
            for (var i = 0, length = findPictureSrc.length; i < length; i++) {
                var findPictureObj = {
                    minPitcure: "",
                    picture: ""
                }
                findPictureObj.minPitcure = AppX.appConfig.xjapiroot.substr(0, AppX.appConfig.xjapiroot.length - 3) + minFindPictureSrc[i];//隐患处理照片
                findPictureObj.picture = AppX.appConfig.xjapiroot.substr(0, AppX.appConfig.xjapiroot.length - 3) + findPictureSrc[i];//隐患处理照片
                findPictureObjArray.push(findPictureObj);
            }


        }
        var clearPictureObjArray = [];
        if (this.clearPicture !== "") {
            var clearPictureSrc = this.clearPicture.split(",");
            var minClearPictureSrc = this.clearPicture.split(",");
            for (var i = 0, length = clearPictureSrc.length; i < length; i++) {
                var clearPictureObj = {
                    minPitcure: "",
                    picture: ""
                }
                clearPictureObj.minPitcure = AppX.appConfig.xjapiroot.substr(0, AppX.appConfig.xjapiroot.length - 3) + minClearPictureSrc[i];//隐患处理照片
                clearPictureObj.picture = AppX.appConfig.xjapiroot.substr(0, AppX.appConfig.xjapiroot.length - 3) + clearPictureSrc[i];//隐患处理照片
                clearPictureObjArray.push(clearPictureObj);
            }

        }
        var aTitle = this.type + "-" + this.finder;//链接的 title属性
        var subTypeName = this.type;
        if (subTypeName.length > 10) {
            subTypeName = subTypeName.substr(0, 10) + "...";
        }
        var subFindTime = this.findTime.split(" ")[1];
        subFindTime = subFindTime.split(":")[0] + ":" + subFindTime.split(":")[1];
        var address = this.address; //隐患地址
        var subAddress = this.address;
        if (address.length > 10) {
            subAddress = address.substr(0, 10) + "...";
        }
        data = [this.departmentId, this._finderId, this.longitude, this.latitude, aTitle, subTypeName, subFindTime, this.address, subAddress, this.handleProcess, findPictureObjArray.concat(clearPictureObjArray)];
        return data;
    }

    public getHideDangePopupData() {
        //[地址，隐患类型，图片，上报人员，备注,语音，上报时间]
        var data = [];
        var pictureHtml = "无"
        if (this.picture != "") {
            var pictureSrc = this.picture.split(",");
            pictureHtml = ""
            for (var i = 0, length = pictureSrc.length; i < length; i++) {
                var pictureObj = "<li><img src='" + (AppX.appConfig.xjapiroot.substr(0, AppX.appConfig.xjapiroot.length - 3) + pictureSrc[i]) + "'/></li>";
                pictureHtml = pictureHtml + pictureObj;
            }
        }
        var audioHtml = "无音频";
        if (this.audio != "") {
            var audioSrc = this.audio.split(",");
            audioHtml = ""
            for (var i = 0, length = audioSrc.length; i < length; i++) {
                var audioObj = "<audio controls='controls' preload='auto'  src='" + (AppX.appConfig.xjapiroot.substr(0, AppX.appConfig.xjapiroot.length - 3) + audioSrc[i]) + "'/>";
                audioHtml = audioHtml + audioObj;
            }
        }
        data = [this.address, this.type, pictureHtml, this.finder, this.findNotes, audioHtml, this.findTime];
        return data;
    }





}

class BackGroundInterface {
    url: string;
    headers;
    data;
    callback;
    response;

    constructor(url, headers, data, callback?) {
        this.url = url;
        this.headers = headers;
        this.data = data;
        this.callback = callback || undefined;
        this.sendRequest();
    }

    private sendRequest() {
        $.ajax({
            headers: this.headers,
            type: "POST",
            url: this.url,
            data: this.data,
            success: function (result) {
                if (this.callback === undefined) {
                    this.response = result;
                } else {
                    this.callback(result);
                }
            }.bind(this),
            error: function () {

            },
            dataType: "json",
        });
    }

    public getResponse() {
        return this.response();
    }
}


class XJGraphicLayer {
    layerIds;
    symbol;
    geometries;
    graphicLayer;
    map: Map;
    constructor(map, layerIds) {
        this.layerIds = layerIds;
        this.map = map;
        this.addGraphicLayerToMap();
    }

    //批量按顺序添加图层到地图对象
    private addGraphicLayerToMap() {
        for (var i = 0, length = this.layerIds.length; i < length; i++) {
            //除去原有的图层
            if (this.map.getLayer(this.layerIds[i]) !== undefined) {
                var oaraginalGraphicLayer = this.map.getLayer(this.layerIds[i]);
                this.map.removeLayer(oaraginalGraphicLayer);
            }
            var graphicLayer = new GraphicsLayer();
            graphicLayer.id = this.layerIds[i];
            this.map.addLayer(graphicLayer);
            // this.graphicLayer = graphicLayer;
        }
    }

    public addGraphicsToMap(geometries, symbol) {
        this.geometries = geometries;
        this.symbol = symbol;
        for (var i = 0, length = geometries.length; i < length; i++) {
            var graphic = new Graphic(geometries[i], symbol);
            this.graphicLayer.add(graphic);
        }
    }

    //批量清除图形
    public clearGraphics() {
        for (var i = 0, length = this.layerIds.length; i < length; i++) {
            var graphicLayer = <GraphicsLayer>this.map.getLayer(this.layerIds[i]);
            if (graphicLayer !== undefined) {
                graphicLayer.clear();
            }
        }
    }

    //批量按顺序移除图层
    public removeGraphicLayer() {
        for (var i = 0, length = this.layerIds.length; i < length; i++) {
            var graphicLayer = this.map.getLayer(this.layerIds[i]);
            if (graphicLayer !== undefined) {
                this.map.removeLayer(graphicLayer);
            }
        }

    }
}

/*监控设置类 */
class WatchingSetting {
    id: string;//标识id
    refreshTimeSpan: string;//刷新间隔
    pathLineColor: string;//轨迹线颜色
    pathLineWith: string;//轨迹线宽度
    pathPointColor: string;//轨迹点颜色
    pathPointWith: string;//轨迹点宽度
    _workerPathColor: string;//人巡轨迹线颜色
    _carPathColor: string;//车巡轨迹线颜色
    constructor(refreshTimeSpan, workerPathColor, carPathColor, pathLineColor, pathLineWith, pathPointColor, pathPointWith) {
        this._workerPathColor = workerPathColor;
        this._carPathColor = workerPathColor;
        this.refreshTimeSpan = refreshTimeSpan;
        this.pathLineColor = pathLineColor;
        this.pathLineWith = pathLineWith;
        this.pathPointColor = pathPointColor;
        this.pathPointWith = pathPointWith;
    }
}
