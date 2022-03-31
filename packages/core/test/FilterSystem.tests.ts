import { CLEAR_MODES, BLEND_MODES } from '@pixi/constants';
import { Rectangle, Matrix } from '@pixi/math';
import { Renderer, Filter } from '@pixi/core';
import sinon from 'sinon';
import { expect } from 'chai';

describe('FilterSystem', function ()
{
    function onePixelObject(worldTransform, size = 1)
    {
        const mat = worldTransform || Matrix.IDENTITY;

        return {
            isFastRect() { return true; },
            worldTransform: mat,
            getBounds() { return new Rectangle(mat.tx, mat.ty, size, size); },
            render() { /* nothing*/ },
        };
    }

    before(function ()
    {
        this.renderer = new Renderer();
    });

    after(function ()
    {
        this.renderer.destroy();
        this.renderer = null;
    });

    it('should support clearMode', function ()
    {
        const innerFilter = new Filter();
        const filter = new Filter();
        const clearSpy = sinon.spy(this.renderer.framebuffer, 'clear');
        const obj = onePixelObject();
        const filterSystem = this.renderer.filter;

        innerFilter.state.blend = false;

        let clearModeValue = CLEAR_MODES.BLEND;

        filter.apply = (filterSystem, input, output, clearMode) =>
        {
            const tmp = filterSystem.getFilterTexture(input);

            innerFilter.apply(filterSystem, input, tmp, clearModeValue);
            innerFilter.apply(filterSystem, tmp, output, clearMode);
            filterSystem.returnFilterTexture(tmp);
        };

        let prevCalls = 0;

        function render(clearMode, forceClear)
        {
            clearModeValue = clearMode;
            filterSystem.forceClear = forceClear;
            filterSystem.push(obj, [filter]);
            filterSystem.pop();

            const val = clearSpy.callCount;
            const clears = val - prevCalls - 1;

            prevCalls = val;

            return clears;
        }

        expect(render(CLEAR_MODES.BLEND, false)).to.equal(0);
        expect(render(CLEAR_MODES.BLEND, true)).to.equal(0);
        expect(render(CLEAR_MODES.CLEAR, false)).to.equal(1);
        expect(render(CLEAR_MODES.CLEAR, true)).to.equal(1);
        expect(render(CLEAR_MODES.AUTO, false)).to.equal(0);
        expect(render(CLEAR_MODES.AUTO, true)).to.equal(1);

        // check that there are two temp textures of same size
        const keys = Object.keys(filterSystem.texturePool.texturePool);

        expect(keys.sort()).to.deep.eq(['65537']);
        expect(filterSystem.texturePool.texturePool[65537].length).to.equal(2);
    });

    function rectToString(rect)
    {
        return `(${rect.x}, ${rect.y}, ${rect.width}, ${rect.height})`;
    }

    it('should account autoFit for global projection transform and rounding', function ()
    {
        const obj = onePixelObject(new Matrix().translate(20, 10), 10);
        const { renderer } = this;
        const src = new Rectangle(9, 10, 100, 100);
        const dst = new Rectangle(0, 0, 50, 50);
        const trans = new Matrix().translate(-14, -5);

        renderer.resize(50, 50);
        renderer.projection.transform = trans;
        renderer.renderTexture.bind(null, src, dst);

        const filters = [new Filter()];

        renderer.filter.push(obj, filters);

        expect(renderer.projection.transform).to.be.null;

        const newSrc = renderer.projection.sourceFrame;
        const newDst = renderer.projection.destinationFrame;

        // coords are cut to left-top corner of src, moved by inverse of transform
        expect(newSrc.x).equal(23);
        expect(newSrc.y).equal(15);
        // 20-14 = 6, but left pixel start at 9, so we cut 3 pixels, making width=10-3=7,
        //  but round it to 8 because we scale it down 2 times in src->dst
        expect(newSrc.width).equal(8);
        // cut 5 pixels from height, 10-5=5, rounded up to 6 to match resulting pixel grid
        expect(newSrc.height).equal(6);
        // destination has the same size
        expect(newDst.width).equal(8);
        expect(newDst.height).equal(6);
        renderer.filter.pop();
        expect(renderer.projection.transform).to.equal(trans);
        expect(rectToString(renderer.projection.sourceFrame)).equal(rectToString(src));
        expect(rectToString(renderer.projection.destinationFrame)).equal(rectToString(dst));
        renderer.projection.transform = null;
    });

    it('should round the source frame in screen space even when rotated by 90°', function ()
    {
        const obj = {
            getBounds() { return new Rectangle(0.1, 0.1, 100, 100); },
            render() { /* Mock */ },
        };
        const { renderer } = this;
        const src = new Rectangle(0, 0, 101, 101);
        const dst = new Rectangle(0, 0, 50, 50);
        const transform = new Matrix()
            .translate(-50.05, -50.05)
            .rotate(Math.PI)
            .translate(50.05, 50.05);

        renderer.projection.transform = transform;
        renderer.renderTexture.bind(null, src, dst);

        const filters = [new Filter()];

        renderer.filter.push(obj, filters);

        const newSrc = renderer.projection.sourceFrame;
        const newDst = renderer.projection.destinationFrame;

        // Coords are shifted by 2x (0.1, 0.1)
        expect(newSrc.x).to.be.closeTo(-0.9, 1e-5);
        expect(newSrc.y).to.be.closeTo(-0.9, 1e-5);
        expect(newSrc.width).to.closeTo(101, 1e-5);
        expect(newSrc.height).to.closeTo(101, 1e-5);
    });
});
